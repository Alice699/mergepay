//! MergePay: a GitHub pull-request bounty escrow built with Rialo Venus.
//!
//! A sponsor publishes and funds a workflow PDA. A contributor claims it with a
//! separate wallet-owned record before a custom Rialo REX WASM component
//! verifies GitHub's pull-request, commit-status, check-run, and review APIs.
//! The exact head commit, base branch, and optional CI/review policy are locked
//! at creation. Only a byte-identical, unanimous proof can release escrow.

use rialo_venus_proc_macro::rialo;

rialo! {
    workflow {
        state {
            sponsor: Pubkey,
            beneficiary: Pubkey,
            github_owner: String,
            github_repo: String,
            pull_number: u64,
            amount_kelvin: u64,
            deadline_unix_ms: u64,
            funded: bool,
            merge_confirmed: bool,
            paid: bool,
            refunded: bool,
            checks: u64,
            claim_request: bool,
            claim_target: Pubkey,
            claimant_github: String,
            claimant_github_id: u64,
            github_auth_ciphertext: Vec<u8>,
            github_url_ciphertext: Vec<u8>,
            next_merge_check_unix_ms: u64,
            expected_head_sha: String,
            expected_base_ref: String,
            require_ci_success: bool,
            minimum_approvals: u64,
            proof_status: u64,
            proof_head_sha: String,
            proof_base_ref: String,
            proof_merge_commit_sha: String,
            proof_ci_success: bool,
            proof_approvals: u64,
            proof_checked_unix_ms: u64,
        }

        rex {
            pub fn verify_settlement(
                owner: String,
                repo: String,
                pull_number: u64,
                expected_head_sha: String,
                expected_base_ref: String,
                require_ci_success: bool,
                minimum_approvals: u64
            ) -> Result<String, String> {
                use rialo::rex_component::http;
                use serde_json::Value;

                let headers = vec![
                    ("Accept".to_string(), "application/vnd.github+json".to_string()),
                    ("X-GitHub-Api-Version".to_string(), "2022-11-28".to_string()),
                    ("User-Agent".to_string(), "MergePay-Rialo/0.2".to_string()),
                ];
                let fetch_json = |url: String| -> Result<(Value, Vec<(String, String)>), String> {
                    let response = http::get(&url, &headers, 10_000)
                        .map_err(|error| format!("GitHub request failed: {}", error))?;
                    if response.status != 200 {
                        return Err(format!("GitHub returned HTTP {}", response.status));
                    }
                    if response.body.len() > 1_000_000 {
                        return Err("GitHub response exceeded the proof limit".to_string());
                    }
                    let value = serde_json::from_slice::<Value>(&response.body)
                        .map_err(|_| "GitHub returned invalid JSON".to_string())?;
                    Ok((value, response.headers))
                };
                let encode = |
                    code: u64,
                    head: &str,
                    merge_commit: &str,
                    ci_success: bool,
                    approvals: u64,
                    base_ref: &str,
                | -> String {
                    format!(
                        "MP1|{}|{}|{}|{}|{}|{}",
                        code,
                        head,
                        merge_commit,
                        if ci_success { 1 } else { 0 },
                        approvals,
                        base_ref
                    )
                };

                let pull_url = format!(
                    "https://api.github.com/repos/{}/{}/pulls/{}",
                    owner,
                    repo,
                    pull_number
                );
                let (pull, _) = fetch_json(pull_url)?;
                let head_sha = pull
                    .pointer("/head/sha")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "GitHub pull response omitted head SHA".to_string())?;
                let base_ref = pull
                    .pointer("/base/ref")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "GitHub pull response omitted base ref".to_string())?;
                let merged = pull
                    .get("merged")
                    .and_then(Value::as_bool)
                    .ok_or_else(|| "GitHub pull response omitted merged state".to_string())?;

                if head_sha != expected_head_sha {
                    return Ok(encode(2, head_sha, "-", false, 0, base_ref));
                }
                if base_ref != expected_base_ref {
                    return Ok(encode(3, head_sha, "-", false, 0, base_ref));
                }
                if !merged {
                    return Ok(encode(1, head_sha, "-", false, 0, base_ref));
                }

                let merge_commit = pull
                    .get("merge_commit_sha")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Merged pull omitted merge commit SHA".to_string())?;

                let mut ci_success = !require_ci_success;
                if require_ci_success {
                    let status_url = format!(
                        "https://api.github.com/repos/{}/{}/commits/{}/status",
                        owner,
                        repo,
                        expected_head_sha
                    );
                    let (status, _) = fetch_json(status_url)?;
                    let status_count = status
                        .get("total_count")
                        .and_then(Value::as_u64)
                        .ok_or_else(|| "GitHub status response omitted total_count".to_string())?;
                    let legacy_ok = status_count == 0
                        || status.get("state").and_then(Value::as_str) == Some("success");

                    let checks_url = format!(
                        "https://api.github.com/repos/{}/{}/commits/{}/check-runs?filter=latest&per_page=100",
                        owner,
                        repo,
                        expected_head_sha
                    );
                    let (checks, _) = fetch_json(checks_url)?;
                    let check_count = checks
                        .get("total_count")
                        .and_then(Value::as_u64)
                        .ok_or_else(|| "GitHub checks response omitted total_count".to_string())?;
                    if check_count > 100 {
                        return Err("GitHub check-run proof requires pagination".to_string());
                    }
                    let check_runs = checks
                        .get("check_runs")
                        .and_then(Value::as_array)
                        .ok_or_else(|| "GitHub checks response omitted check_runs".to_string())?;
                    let checks_complete = check_runs.iter().all(|check| {
                        check.get("status").and_then(Value::as_str) == Some("completed")
                            && matches!(
                                check.get("conclusion").and_then(Value::as_str),
                                Some("success" | "neutral" | "skipped")
                            )
                    });
                    ci_success = (status_count + check_count) > 0
                        && legacy_ok
                        && checks_complete;
                    if !ci_success {
                        return Ok(encode(4, head_sha, merge_commit, false, 0, base_ref));
                    }
                }

                let mut approvals = 0u64;
                if minimum_approvals > 0 {
                    let reviews_url = format!(
                        "https://api.github.com/repos/{}/{}/pulls/{}/reviews?per_page=100",
                        owner,
                        repo,
                        pull_number
                    );
                    let (reviews, review_headers) = fetch_json(reviews_url)?;
                    let has_next_page = review_headers.iter().any(|(name, value)| {
                        name.eq_ignore_ascii_case("link") && value.contains("rel=\"next\"")
                    });
                    if has_next_page {
                        return Err("GitHub review proof requires pagination".to_string());
                    }
                    let review_items = reviews
                        .as_array()
                        .ok_or_else(|| "GitHub reviews response was not an array".to_string())?;
                    let mut latest = std::collections::BTreeMap::<
                        u64,
                        (u64, String, String, String),
                    >::new();
                    for review in review_items {
                        let Some(user_id) = review.pointer("/user/id").and_then(Value::as_u64) else {
                            continue;
                        };
                        let state = review
                            .get("state")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();
                        if matches!(state.as_str(), "COMMENTED" | "PENDING") {
                            continue;
                        }
                        let Some(review_id) = review.get("id").and_then(Value::as_u64) else {
                            continue;
                        };
                        let commit_id = review
                            .get("commit_id")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();
                        let association = review
                            .get("author_association")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string();
                        let should_replace = latest
                            .get(&user_id)
                            .map(|(latest_id, _, _, _)| review_id > *latest_id)
                            .unwrap_or(true);
                        if should_replace {
                            latest.insert(
                                user_id,
                                (review_id, state, commit_id, association),
                            );
                        }
                    }
                    approvals = latest
                        .values()
                        .filter(|(_, state, commit_id, association)| {
                            state == "APPROVED"
                                && commit_id == &expected_head_sha
                                && matches!(association.as_str(), "OWNER" | "MEMBER" | "COLLABORATOR")
                        })
                        .count() as u64;
                    if approvals < minimum_approvals {
                        return Ok(encode(
                            5,
                            head_sha,
                            merge_commit,
                            ci_success,
                            approvals,
                            base_ref,
                        ));
                    }
                }

                Ok(encode(
                    6,
                    head_sha,
                    merge_commit,
                    ci_success,
                    approvals,
                    base_ref,
                ))
            }
        }

        program {
            use rialo_rex_processor_interface::state::RexReport;
            use rialo_venus::read_from_storage;
            use rialo_s_program::{
                entrypoint::ProgramResult,
                msg,
                program::invoke,
                program_error::ProgramError,
                pubkey::Pubkey,
                system_instruction,
                system_program,
                sysvar::Sysvar,
            };
            use rialo_types::{RexData, RexOutput};

            initiating fn create_bounty(
                &mut self,
                beneficiary: Pubkey,
                github_owner: String,
                github_repo: String,
                pull_number: u64,
                amount_kelvin: u64,
                deadline_unix_ms: u64,
                expected_head_sha: String,
                expected_base_ref: String,
                require_ci_success: bool,
                minimum_approvals: u64,
            ) -> ProgramResult {
                let current_unix_ms = self.unix_timestamp_ms();
                msg!(
                    "MergePay create input: beneficiary={}, owner={}, repo={}, pr={}, amount={}, deadline_ms={}, now_ms={}",
                    beneficiary,
                    github_owner,
                    github_repo,
                    pull_number,
                    amount_kelvin,
                    deadline_unix_ms,
                    current_unix_ms
                );

                if self.__rex_bytecode_account == Pubkey::default() {
                    msg!("MergePay rejected create: settlement REX bytecode is not configured");
                    return Err(ProgramError::InvalidArgument);
                }
                if !self.has_authorized_rex_bytecode_account() {
                    msg!("MergePay rejected create: unauthorized settlement REX bytecode");
                    return Err(ProgramError::InvalidArgument);
                }
                self.require_payer_signature()?;
                if amount_kelvin == 0 {
                    msg!("MergePay rejected create: amount is zero");
                    return Err(ProgramError::InvalidArgument);
                }
                if pull_number == 0 {
                    msg!("MergePay rejected create: pull number is zero");
                    return Err(ProgramError::InvalidArgument);
                }
                if !self.valid_github_slug(&github_owner) {
                    msg!("MergePay rejected create: invalid GitHub owner");
                    return Err(ProgramError::InvalidArgument);
                }
                if !self.valid_github_slug(&github_repo) {
                    msg!("MergePay rejected create: invalid GitHub repository");
                    return Err(ProgramError::InvalidArgument);
                }
                if !self.valid_github_sha(&expected_head_sha) {
                    msg!("MergePay rejected create: invalid expected head SHA");
                    return Err(ProgramError::InvalidArgument);
                }
                if !self.valid_github_ref(&expected_base_ref) {
                    msg!("MergePay rejected create: invalid expected base ref");
                    return Err(ProgramError::InvalidArgument);
                }
                if minimum_approvals > 10 {
                    msg!("MergePay rejected create: approval policy exceeds limit");
                    return Err(ProgramError::InvalidArgument);
                }
                if current_unix_ms < 0 || deadline_unix_ms <= current_unix_ms as u64 {
                    msg!("MergePay rejected create: deadline is not in the future");
                    return Err(ProgramError::InvalidArgument);
                }

                let expected_head_sha = expected_head_sha.to_ascii_lowercase();

                self.sponsor = *self.payer_account().key;
                self.beneficiary = beneficiary;
                self.github_owner = github_owner;
                self.github_repo = github_repo;
                self.pull_number = pull_number;
                self.amount_kelvin = amount_kelvin;
                self.deadline_unix_ms = deadline_unix_ms;
                self.funded = false;
                self.merge_confirmed = false;
                self.paid = false;
                self.refunded = false;
                self.checks = 0;
                self.claim_request = false;
                self.claim_target = Pubkey::default();
                self.claimant_github = String::new();
                self.claimant_github_id = 0;
                self.github_auth_ciphertext = Vec::new();
                self.github_url_ciphertext = Vec::new();
                self.next_merge_check_unix_ms = 0;
                self.expected_head_sha = expected_head_sha;
                self.expected_base_ref = expected_base_ref;
                self.require_ci_success = require_ci_success;
                self.minimum_approvals = minimum_approvals;
                self.proof_status = 0;
                self.proof_head_sha = String::new();
                self.proof_base_ref = String::new();
                self.proof_merge_commit_sha = String::new();
                self.proof_ci_success = false;
                self.proof_approvals = 0;
                self.proof_checked_unix_ms = 0;

                if self.beneficiary == Pubkey::default() {
                    msg!(
                        "MergePay bounty created: {}/{}#{} is open for a contributor claim ({} kelvin)",
                        self.github_owner,
                        self.github_repo,
                        self.pull_number,
                        self.amount_kelvin
                    );
                } else {
                    msg!(
                        "MergePay bounty created: {}/{}#{} -> {} ({} kelvin)",
                        self.github_owner,
                        self.github_repo,
                        self.pull_number,
                        self.beneficiary,
                        self.amount_kelvin
                    );
                }
                Ok(())
            }

            initiating fn request_claim(
                &mut self,
                target_workflow: Pubkey,
                claimant_github: String,
                claimant_github_id: u64,
            ) -> ProgramResult {
                self.require_payer_signature()?;
                let target_account = ReadAccountInfo::from(target_workflow);
                if target_account.key != &target_workflow {
                    msg!("MergePay rejected claim: target account does not match target_workflow");
                    return Err(ProgramError::InvalidArgument);
                }
                if target_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }
                if !self.valid_github_slug(&claimant_github) || claimant_github_id == 0 {
                    msg!("MergePay rejected claim: invalid GitHub identity");
                    return Err(ProgramError::InvalidArgument);
                }

                let target_state = read_from_storage::<State>(&target_account.data.borrow())
                    .map_err(|_| ProgramError::InvalidAccountData)?;
                if !self.has_authorized_rex_bytecode_account()
                    || self.__rex_bytecode_account == Pubkey::default()
                    || target_state.__rex_bytecode_account == Pubkey::default()
                    || target_state.__rex_bytecode_account != self.__rex_bytecode_account
                {
                    msg!("MergePay rejected claim: settlement REX bytecode does not match");
                    return Err(ProgramError::InvalidArgument);
                }
                if target_state.claim_request
                    || target_state.sponsor == Pubkey::default()
                    || target_state.beneficiary != Pubkey::default()
                    || target_state.funded
                    || target_state.merge_confirmed
                    || target_state.paid
                    || target_state.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }
                if target_state.sponsor == *self.payer_account().key {
                    msg!("MergePay rejected claim: sponsor cannot claim its own bounty");
                    return Err(ProgramError::InvalidArgument);
                }
                let current_unix_ms = self.unix_timestamp_ms();
                if current_unix_ms < 0 || current_unix_ms as u64 >= target_state.deadline_unix_ms {
                    msg!("MergePay rejected claim: bounty deadline has passed");
                    return Err(ProgramError::InvalidArgument);
                }

                self.sponsor = target_state.sponsor;
                self.beneficiary = *self.payer_account().key;
                self.github_owner = target_state.github_owner;
                self.github_repo = target_state.github_repo;
                self.pull_number = target_state.pull_number;
                self.amount_kelvin = target_state.amount_kelvin;
                self.deadline_unix_ms = target_state.deadline_unix_ms;
                self.funded = false;
                self.merge_confirmed = false;
                self.paid = false;
                self.refunded = false;
                self.checks = 0;
                self.claim_request = true;
                self.claim_target = *target_account.key;
                self.claimant_github = claimant_github;
                self.claimant_github_id = claimant_github_id;
                self.github_auth_ciphertext = Vec::new();
                self.github_url_ciphertext = Vec::new();
                self.next_merge_check_unix_ms = 0;
                self.expected_head_sha = target_state.expected_head_sha;
                self.expected_base_ref = target_state.expected_base_ref;
                self.require_ci_success = target_state.require_ci_success;
                self.minimum_approvals = target_state.minimum_approvals;
                self.proof_status = 0;
                self.proof_head_sha = String::new();
                self.proof_base_ref = String::new();
                self.proof_merge_commit_sha = String::new();
                self.proof_ci_success = false;
                self.proof_approvals = 0;
                self.proof_checked_unix_ms = 0;

                msg!(
                    "MergePay claim requested by {} for {}/{}#{}",
                    self.beneficiary,
                    self.github_owner,
                    self.github_repo,
                    self.pull_number
                );
                Ok(())
            }

            control fn fund(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                self.require_state_consistency()?;
                if self.claim_request
                    || self.beneficiary == Pubkey::default()
                    || self.funded
                    || self.paid
                    || self.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }
                if self.github_auth_ciphertext.len() < 2
                    || self.github_url_ciphertext.len() < 2
                {
                    msg!("MergePay rejected funding: settlement storage is not prepared");
                    return Err(ProgramError::InvalidArgument);
                }

                let current_unix_ms = self.unix_timestamp_ms();
                if current_unix_ms < 0 || current_unix_ms as u64 >= self.deadline_unix_ms {
                    msg!("MergePay rejected funding: bounty deadline has passed");
                    return Err(ProgramError::InvalidArgument);
                }

                let payer_account = self.payer_account().clone();
                let workflow_account = self.accounts[1].clone();
                if !payer_account.is_writable || !workflow_account.is_writable {
                    msg!("MergePay rejected funding: writable payer and workflow accounts are required");
                    return Err(ProgramError::InvalidArgument);
                }
                if workflow_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }
                let system_program_account = self
                    .accounts
                    .iter()
                    .find(|account| system_program::check_id(account.key))
                    .cloned()
                    .ok_or(ProgramError::NotEnoughAccountKeys)?;

                invoke(
                    &system_instruction::transfer(
                        payer_account.key,
                        workflow_account.key,
                        self.amount_kelvin,
                    ),
                    &[
                        payer_account,
                        workflow_account,
                        system_program_account,
                    ],
                )?;

                self.next_merge_check_unix_ms = 0;
                self.funded = true;
                // Start the autonomous settlement loop as soon as escrow is
                // funded. The sponsor may still use check_merge as a manual
                // fallback, but normal operation no longer depends on it.
                //
                AFTER self.timer_timestamp_after_ms(1_000) CALL [run_merge_check];
                msg!(
                    "MergePay escrow funded with {} kelvin; native settlement heartbeat scheduled through {}",
                    self.amount_kelvin,
                    self.deadline_unix_ms
                );
                Ok(())
            }

            control fn accept_claim(&mut self, claim_workflow: Pubkey) -> ProgramResult {
                self.require_sponsor()?;
                self.require_state_consistency()?;
                if self.claim_request
                    || self.beneficiary != Pubkey::default()
                    || self.funded
                    || self.paid
                    || self.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }

                let claim_account = ReadAccountInfo::from(claim_workflow);
                if claim_account.key != &claim_workflow {
                    msg!("MergePay rejected claim acceptance: claim account does not match claim_workflow");
                    return Err(ProgramError::InvalidArgument);
                }
                if claim_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }
                let claim_state = read_from_storage::<State>(&claim_account.data.borrow())
                    .map_err(|_| ProgramError::InvalidAccountData)?;
                if !claim_state.claim_request
                    || claim_state.claim_target != *self.accounts[1].key
                    || claim_state.sponsor != self.sponsor
                    || claim_state.beneficiary == Pubkey::default()
                    || claim_state.funded
                    || claim_state.merge_confirmed
                    || claim_state.paid
                    || claim_state.refunded
                    || claim_state.github_owner != self.github_owner
                    || claim_state.github_repo != self.github_repo
                    || claim_state.pull_number != self.pull_number
                    || claim_state.amount_kelvin != self.amount_kelvin
                    || claim_state.deadline_unix_ms != self.deadline_unix_ms
                    || claim_state.expected_head_sha != self.expected_head_sha
                    || claim_state.expected_base_ref != self.expected_base_ref
                    || claim_state.require_ci_success != self.require_ci_success
                    || claim_state.minimum_approvals != self.minimum_approvals
                    || claim_state.__rex_bytecode_account != self.__rex_bytecode_account
                    || !self.valid_github_slug(&claim_state.claimant_github)
                    || claim_state.claimant_github_id == 0
                {
                    return Err(ProgramError::InvalidArgument);
                }

                let current_unix_ms = self.unix_timestamp_ms();
                if current_unix_ms < 0 || current_unix_ms as u64 >= self.deadline_unix_ms {
                    return Err(ProgramError::InvalidArgument);
                }

                self.beneficiary = claim_state.beneficiary;
                self.claimant_github = claim_state.claimant_github;
                self.claimant_github_id = claim_state.claimant_github_id;
                msg!(
                    "MergePay claim accepted: {} (@{} / GitHub {})",
                    self.beneficiary,
                    self.claimant_github,
                    self.claimant_github_id
                );
                Ok(())
            }

            // Keep the public instruction as a control call. The control call
            // only schedules a fresh native-timer handler; the handler below owns
            // the REX request and therefore receives a new async branch for
            // every retry. Putting the HTTP request directly in this control
            // function would pin it to branch zero and make the next check
            // reuse a consumed one-shot account.
            control fn check_merge(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                self.require_state_consistency()?;
                if !self.funded
                    || self.beneficiary == Pubkey::default()
                    || self.paid
                    || self.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }
                let current_unix_ms = self.unix_timestamp_ms();
                if current_unix_ms < 0 || current_unix_ms as u64 >= self.deadline_unix_ms {
                    return Err(ProgramError::InvalidArgument);
                }

                // A short native timer is supported by the current Venus
                // runtime and gives the handler a fresh branch number. Force
                // the next callback to perform an immediate REX check.
                self.next_merge_check_unix_ms = 0;
                AFTER self.timer_timestamp_after_ms(1_000) CALL [run_merge_check];

                Ok(())
            }

            handler fn run_merge_check(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                self.require_state_consistency()?;
                if !self.funded
                    || self.beneficiary == Pubkey::default()
                    || self.paid
                    || self.refunded
                {
                    return Ok(());
                }
                let current_unix_ms = self.unix_timestamp_ms();
                if current_unix_ms < 0 {
                    return Ok(());
                }

                let current_unix_ms_u64 = current_unix_ms as u64;
                if current_unix_ms_u64 >= self.deadline_unix_ms {
                    // The same native heartbeat that polls GitHub also owns
                    // the deadline branch. This avoids a long-lived absolute
                    // timer whose bounded subscription window could expire.
                    return self.execute_refund(false);
                }

                // Venus timestamp subscriptions are valid only for a bounded
                // slot window. Re-arm frequently enough to keep the workflow
                // alive, but perform the external GitHub request at a slower
                // cadence so each bounty does not consume the API rate limit.
                AFTER self.timer_timestamp_after_ms(2_000) CALL [run_merge_check];

                if self.next_merge_check_unix_ms != 0
                    && current_unix_ms_u64 < self.next_merge_check_unix_ms
                {
                    return Ok(());
                }

                // Before a merge, every policy only performs the single pull-request
                // read above; CI and review endpoints are fetched only after GitHub
                // reports the PR as merged. A five-minute policy throttle therefore
                // created a blind window where a PR merged minutes before its deadline
                // could still be refunded. Keep all workflows on a 30-second cadence
                // and clamp one final proof request ahead of the deadline so the REX
                // collection window can finish before the refund branch becomes due.
                let proof_interval_ms = 30_000u64;
                let regular_next_check = current_unix_ms_u64
                    .checked_add(proof_interval_ms)
                    .unwrap_or(self.deadline_unix_ms);
                let final_proof_unix_ms = self.deadline_unix_ms.saturating_sub(20_000);
                self.next_merge_check_unix_ms = if final_proof_unix_ms > current_unix_ms_u64 {
                    regular_next_check.min(final_proof_unix_ms)
                } else {
                    regular_next_check
                };
                self.checks = self.checks.saturating_add(1);
                msg!("MergePay settlement proof check #{} scheduled", self.checks);

                let beneficiary = self.beneficiary;
                let owner = self.github_owner.clone();
                let repo = self.github_repo.clone();
                let pull_number = self.pull_number;
                let expected_head_sha = self.expected_head_sha.clone();
                let expected_base_ref = self.expected_base_ref.clone();
                let require_ci_success = self.require_ci_success;
                let minimum_approvals = self.minimum_approvals;

                AFTER report = [verify_settlement
                    owner: owner
                    repo: repo
                    pull_number: pull_number
                    expected_head_sha: expected_head_sha
                    expected_base_ref: expected_base_ref
                    require_ci_success: require_ci_success
                    minimum_approvals: minimum_approvals
                    // GitHub REST is an external HTTPS dependency. The Venus
                    // default REX collection window is 300ms, which is too
                    // short for a cold DNS/TLS request and caused otherwise
                    // valid merged proofs to become non-unanimous timeouts.
                    request_delay_ms: 15_000u64
                ]
                CALL [handle_merge_response beneficiary: beneficiary report: report];
                Ok(())
            }

            // Venus 0.18.1 requires the event payload to remain the final handler
            // parameter so ordinary callback parameters become account arguments.
            handler fn handle_merge_response(
                &mut self,
                beneficiary: Pubkey,
                report: RexReport,
            ) -> ProgramResult {
                self.require_sponsor()?;
                self.require_state_consistency()?;
                if beneficiary != self.beneficiary {
                    return Err(ProgramError::InvalidArgument);
                }
                let beneficiary_account = WriteAccountInfo::from(beneficiary);
                if beneficiary_account.key != &self.beneficiary
                    || beneficiary_account.key == self.accounts[1].key
                {
                    return Err(ProgramError::InvalidArgument);
                }
                if !self.funded || self.paid || self.refunded {
                    return Ok(());
                }

                // A merge response that was already in flight when the
                // deadline timer fired must not win the race against refund.
                // Only an active, pre-deadline workflow can be paid.
                let current_unix_ms = self.unix_timestamp_ms();
                if current_unix_ms < 0 || current_unix_ms as u64 >= self.deadline_unix_ms {
                    msg!("MergePay merge response arrived after deadline; refund remains authoritative");
                    return Ok(());
                }

                let mut output_count = 0u64;
                let mut success_count = 0u64;
                let mut consensus_payload: Option<Vec<u8>> = None;
                let mut payloads_match = true;

                // `RexReport::outputs()` filters out updates that fail to
                // deserialize. Counting that filtered iterator would allow a
                // report containing one valid output plus malformed validator
                // updates to look unanimous. Every raw update must decode and
                // participate in the consensus decision.
                for update in &report.updates {
                    output_count += 1;
                    let Ok(output) = update.try_data_as_output() else {
                        msg!("MergePay rejected undecodable REX validator output");
                        payloads_match = false;
                        continue;
                    };
                    match output {
                        RexOutput::Success(response) => {
                            if let RexData::Raw(payload) = response.response {
                                if payload.len() > 512 {
                                    msg!("MergePay rejected oversized settlement proof");
                                    payloads_match = false;
                                    continue;
                                }
                                if let Some(expected) = &consensus_payload {
                                    if expected != &payload {
                                        payloads_match = false;
                                    }
                                } else {
                                    consensus_payload = Some(payload.clone());
                                }
                                success_count += 1;
                            } else {
                                msg!("MergePay rejected filtered settlement proof");
                                payloads_match = false;
                            }
                        }
                        RexOutput::RexError(error) => {
                            msg!("MergePay inconclusive REX error: {}", error);
                        }
                        RexOutput::UnserializableResponse(error) => {
                            msg!("MergePay unserializable response: {}", error);
                        }
                        _ => {
                            msg!("MergePay received an unsupported REX output");
                        }
                    }
                }

                if output_count == 0 {
                    msg!("MergePay received an empty REX report");
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                }

                if success_count != output_count || !payloads_match {
                    msg!(
                        "MergePay REX proof was not unanimous: {}/{} usable outputs",
                        success_count,
                        output_count
                    );
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                }

                let Some(payload) = consensus_payload else {
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                };
                let Ok(proof) = std::str::from_utf8(&payload) else {
                    msg!("MergePay rejected non-UTF8 settlement proof");
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                };
                let fields: Vec<&str> = proof.split('|').collect();
                if fields.len() != 7 || fields[0] != "MP1" {
                    msg!("MergePay rejected malformed settlement proof");
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                }
                let Ok(proof_status) = fields[1].parse::<u64>() else {
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                };
                let proof_head_sha = fields[2];
                let proof_merge_commit_sha = fields[3];
                let proof_ci_success = match fields[4] {
                    "0" => false,
                    "1" => true,
                    _ => {
                        self.record_inconclusive_proof(current_unix_ms as u64);
                        return Ok(());
                    }
                };
                let Ok(proof_approvals) = fields[5].parse::<u64>() else {
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                };
                let proof_base_ref = fields[6];
                if !(1..=6).contains(&proof_status)
                    || !self.valid_github_sha(proof_head_sha)
                    || !self.valid_github_ref(proof_base_ref)
                    || (proof_merge_commit_sha != "-"
                        && !self.valid_github_sha(proof_merge_commit_sha))
                {
                    msg!("MergePay rejected invalid settlement proof fields");
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                }

                self.proof_status = proof_status;
                self.proof_head_sha = Self::fixed_proof_field(proof_head_sha, 40);
                self.proof_base_ref = Self::fixed_proof_field(proof_base_ref, 128);
                self.proof_merge_commit_sha = if proof_merge_commit_sha == "-" {
                    Self::fixed_proof_field("", 40)
                } else {
                    Self::fixed_proof_field(proof_merge_commit_sha, 40)
                };
                self.proof_ci_success = proof_ci_success;
                self.proof_approvals = proof_approvals;
                self.proof_checked_unix_ms = current_unix_ms as u64;

                if proof_status != 6 {
                    msg!(
                        "MergePay settlement conditions remain locked: proof status {}",
                        proof_status
                    );
                    return Ok(());
                }
                if proof_head_sha != self.expected_head_sha
                    || proof_base_ref != self.expected_base_ref
                    || !self.valid_github_sha(proof_merge_commit_sha)
                    || (self.require_ci_success && !proof_ci_success)
                    || proof_approvals < self.minimum_approvals
                {
                    msg!("MergePay rejected proof that did not reproduce locked policy");
                    self.record_inconclusive_proof(current_unix_ms as u64);
                    return Ok(());
                }

                let workflow_account = self.accounts[1].clone();
                if workflow_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }
                if !workflow_account.is_writable || !beneficiary_account.is_writable {
                    msg!("MergePay rejected payout: writable workflow and beneficiary accounts are required");
                    return Err(ProgramError::InvalidArgument);
                }

                // The workflow PDA must retain rent when possible, but the
                // escrow amount itself is the only balance that can be
                // released. Requiring `amount + current rent` here makes a
                // valid escrow fail after the state grows for the encrypted
                // GitHub envelope: the runtime may hold exactly the escrow
                // plus the account's original reserve, while the resized
                // account reports a larger current rent minimum.
                if workflow_account.kelvins() < self.amount_kelvin {
                    return Err(ProgramError::InsufficientFunds);
                }

                let workflow_balance = workflow_account
                    .kelvins()
                    .checked_sub(self.amount_kelvin)
                    .ok_or(ProgramError::InsufficientFunds)?;
                let beneficiary_balance = beneficiary_account
                    .kelvins()
                    .checked_add(self.amount_kelvin)
                    .ok_or(ProgramError::InvalidArgument)?;

                **workflow_account.try_borrow_mut_kelvins()? = workflow_balance;
                **beneficiary_account.try_borrow_mut_kelvins()? = beneficiary_balance;

                self.merge_confirmed = true;
                self.paid = true;
                msg!(
                    "MergePay released {} kelvin to {}",
                    self.amount_kelvin,
                    self.beneficiary
                );
                Ok(())
            }

            control fn refund(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                self.require_state_consistency()?;
                self.execute_refund(true)
            }

            fn execute_refund(&mut self, enforce_deadline: bool) -> ProgramResult {
                self.require_state_consistency()?;
                let current_unix_ms = self.unix_timestamp_ms();
                // A manual fallback can race the native deadline heartbeat.
                // Treat an already-refunded workflow as success so a stale UI
                // click refreshes cleanly instead of surfacing a false failure.
                if self.refunded {
                    msg!("MergePay refund was already settled");
                    return Ok(());
                }
                if !self.funded || self.paid {
                    if enforce_deadline {
                        return Err(ProgramError::InvalidArgument);
                    }
                    msg!("MergePay native refund callback is already settled");
                    return Ok(());
                }
                if current_unix_ms < 0 {
                    return Err(ProgramError::InvalidArgument);
                }
                // The native timer is scheduled at the deadline boundary, so equality
                // is already expired for the callback as well as the manual fallback.
                if (current_unix_ms as u64) < self.deadline_unix_ms {
                    if enforce_deadline {
                        return Err(ProgramError::InvalidArgument);
                    }
                    msg!("MergePay native refund callback fired before the deadline");
                    return Ok(());
                }

                let workflow_account = &self.accounts[1];
                let sponsor_account = self.payer_account();
                if workflow_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }
                if !workflow_account.is_writable || !sponsor_account.is_writable {
                    msg!("MergePay rejected refund: writable workflow and sponsor accounts are required");
                    return Err(ProgramError::InvalidArgument);
                }
                // Older builds could return the escrow to the sponsor during
                // a later storage resize while leaving `funded=true`. In that
                // case the workflow is already financially recovered, but a
                // second transfer would correctly fail with InsufficientFunds.
                // Mark that legacy workflow settled so both the native timer
                // and the manual fallback become idempotent.
                if workflow_account.kelvins() < self.amount_kelvin {
                    msg!(
                        "MergePay escrow was already recovered during a legacy storage resize"
                    );
                    self.refunded = true;
                    return Ok(());
                }

                let workflow_balance = workflow_account
                    .kelvins()
                    .checked_sub(self.amount_kelvin)
                    .ok_or(ProgramError::InsufficientFunds)?;
                let sponsor_balance = sponsor_account
                    .kelvins()
                    .checked_add(self.amount_kelvin)
                    .ok_or(ProgramError::InvalidArgument)?;

                **workflow_account.try_borrow_mut_kelvins()? = workflow_balance;
                **sponsor_account.try_borrow_mut_kelvins()? = sponsor_balance;
                self.refunded = true;
                msg!("MergePay refunded {} kelvin to sponsor", self.amount_kelvin);
                Ok(())
            }

            control fn status(&mut self) -> ProgramResult {
                msg!(
                    "MergePay status: funded={}, merged={}, paid={}, refunded={}, checks={}, proof_status={}, claim_request={}, claimant=@{} (GitHub {})",
                    self.funded,
                    self.merge_confirmed,
                    self.paid,
                    self.refunded,
                    self.checks,
                    self.proof_status,
                    self.claim_request,
                    self.claimant_github,
                    self.claimant_github_id
                );
                Ok(())
            }

            // Funding is deliberately split into two instructions in one atomic
            // transaction. Venus resizes workflow storage after an instruction
            // returns and normalizes its balance to rent while doing so. If the
            // escrow transfer happens in the same instruction that grows the
            // settlement fields, that normalization returns the bounty to
            // the sponsor. Preparing first lets the account resize; `fund` then
            // transfers into an already stable account and the escrow remains
            // locked until payout or refund.
            control fn prepare_funding(
                &mut self,
                github_auth_ciphertext: Vec<u8>,
            ) -> ProgramResult {
                self.require_sponsor()?;
                self.require_state_consistency()?;
                if self.claim_request
                    || self.beneficiary == Pubkey::default()
                    || self.funded
                    || self.paid
                    || self.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }
                // Keep a small, versioned preparation envelope in workflow
                // storage before escrow is transferred. This deliberately
                // forces any account resize into the first instruction of the
                // atomic prepare+fund transaction, before funds are locked.
                if github_auth_ciphertext.len() < 2
                    || github_auth_ciphertext.len() > 4_096
                    || github_auth_ciphertext.first() != Some(&2)
                {
                    msg!("MergePay rejected funding preparation: invalid settlement envelope");
                    return Err(ProgramError::InvalidArgument);
                }

                let (github_url_ciphertext, github_auth_ciphertext) =
                    self.decode_github_rex_envelope(&github_auth_ciphertext)?;
                let current_unix_ms = self.unix_timestamp_ms();
                if current_unix_ms < 0 || current_unix_ms as u64 >= self.deadline_unix_ms {
                    msg!("MergePay rejected funding preparation: bounty deadline has passed");
                    return Err(ProgramError::InvalidArgument);
                }

                if !self.github_auth_ciphertext.is_empty()
                    || !self.github_url_ciphertext.is_empty()
                {
                    if self.github_auth_ciphertext == github_auth_ciphertext
                        && self.github_url_ciphertext == github_url_ciphertext
                    {
                        // A retry can arrive after the envelope was written but
                        // before an older build reserved the proof slots. Keep
                        // preparation idempotent while making the storage shape
                        // safe before escrow is transferred.
                        self.reserve_proof_storage();
                        msg!("MergePay settlement storage was already prepared");
                        return Ok(());
                    }
                    msg!("MergePay rejected funding preparation: proof already locked");
                    return Err(ProgramError::InvalidArgument);
                }

                self.github_auth_ciphertext = github_auth_ciphertext;
                self.github_url_ciphertext = github_url_ciphertext;
                // Proof fields are written by asynchronous callbacks after the
                // escrow is funded. Reserve their maximum serialized width now;
                // Venus otherwise pays the later rent increase out of escrow.
                self.reserve_proof_storage();
                msg!("MergePay settlement storage prepared for atomic funding");
                Ok(())
            }

            fn require_payer_signature(&self) -> ProgramResult {
                if !self.payer_account().is_signer {
                    msg!("MergePay rejected instruction: payer signature is required");
                    return Err(ProgramError::MissingRequiredSignature);
                }
                Ok(())
            }

            fn require_sponsor(&self) -> ProgramResult {
                self.require_payer_signature()?;
                if self.payer_account().key != &self.sponsor {
                    msg!("MergePay rejected instruction: payer is not the committed sponsor");
                    return Err(ProgramError::MissingRequiredSignature);
                }
                Ok(())
            }

            fn has_authorized_rex_bytecode_account(&self) -> bool {
                // This is the active DevNet verifier deployed with the current
                // program artifact. Binding it on-chain prevents a raw caller
                // from selecting a look-alike REX component that can emit a
                // forged `MP1|6` proof. Rotate this constant together with a
                // program/component redeployment.
                self.__rex_bytecode_account
                    == Pubkey::from_str_const("GcTo6NvSBvszmBogd7y4x9NYMG8ACuVrKy6mcYtQSoJK")
            }

            fn require_authorized_rex_bytecode_account(&self) -> ProgramResult {
                if !self.has_authorized_rex_bytecode_account() {
                    msg!("MergePay rejected instruction: unauthorized settlement REX bytecode");
                    return Err(ProgramError::InvalidAccountData);
                }
                Ok(())
            }

            fn require_workflow_account(&self) -> ProgramResult {
                let workflow_account = &self.accounts[1];
                if workflow_account.owner != self.program_id {
                    msg!("MergePay rejected instruction: workflow account is not program-owned");
                    return Err(ProgramError::IncorrectProgramId);
                }
                if !workflow_account.is_writable {
                    msg!("MergePay rejected instruction: workflow account must be writable");
                    return Err(ProgramError::InvalidArgument);
                }
                Ok(())
            }

            fn require_state_consistency(&self) -> ProgramResult {
                if (self.merge_confirmed && !self.paid)
                    || (self.paid
                        && (!self.funded || !self.merge_confirmed || self.refunded))
                    || (self.refunded
                        && (!self.funded || self.merge_confirmed || self.paid))
                {
                    msg!("MergePay rejected inconsistent settlement state");
                    return Err(ProgramError::InvalidAccountData);
                }
                self.require_workflow_account()?;
                self.require_authorized_rex_bytecode_account()
            }

            fn record_inconclusive_proof(&mut self, checked_unix_ms: u64) {
                self.proof_status = 7;
                self.reserve_proof_storage();
                self.proof_ci_success = false;
                self.proof_approvals = 0;
                self.proof_checked_unix_ms = checked_unix_ms;
            }

            // Venus resizes a workflow PDA to the exact serialized state size.
            // These three values are populated by a later REX callback, so they
            // must keep a fixed-width representation after funding. NUL padding
            // is removed by the typed client before the values reach the UI.
            fn fixed_proof_field(value: &str, width: usize) -> String {
                let mut fixed = value.to_string();
                while fixed.len() < width {
                    fixed.push('\0');
                }
                fixed
            }

            fn reserve_proof_storage(&mut self) {
                self.proof_head_sha = Self::fixed_proof_field("", 40);
                self.proof_base_ref = Self::fixed_proof_field("", 128);
                self.proof_merge_commit_sha = Self::fixed_proof_field("", 40);
            }

            // The public workflow ABI stores JavaScript-compatible Unix
            // milliseconds. DevNet 0.18.1 has exposed both millisecond RPC
            // timestamps and second-based program clock values across runtime
            // surfaces, so normalize defensively at the program boundary.
            fn unix_timestamp_ms(&self) -> i64 {
                let raw = self.unix_timestamp();
                if raw < 0 {
                    raw
                } else if raw < 100_000_000_000 {
                    raw.saturating_mul(1_000)
                } else {
                    raw
                }
            }

            fn timer_timestamp_after_ms(&self, delay_ms: u64) -> u64 {
                let raw = self.unix_timestamp();
                if raw < 0 {
                    return 0;
                }
                if raw < 100_000_000_000 {
                    (raw as u64).saturating_add(delay_ms.saturating_add(999) / 1_000)
                } else {
                    (raw as u64).saturating_add(delay_ms)
                }
            }

            fn decode_github_rex_envelope(
                &self,
                payload: &[u8],
            ) -> Result<(Vec<u8>, Vec<u8>), ProgramError> {
                if payload.len() < 10 || payload.first() != Some(&2) {
                    msg!("MergePay rejected funding: malformed GitHub REX envelope");
                    return Err(ProgramError::InvalidArgument);
                }

                let url_length = u32::from_le_bytes([
                    payload[1],
                    payload[2],
                    payload[3],
                    payload[4],
                ]) as usize;
                let url_start = 5usize;
                let url_end = url_start
                    .checked_add(url_length)
                    .ok_or(ProgramError::InvalidArgument)?;
                let auth_length_start = url_end;
                let auth_length_end = auth_length_start
                    .checked_add(4)
                    .ok_or(ProgramError::InvalidArgument)?;
                if auth_length_end > payload.len() {
                    msg!("MergePay rejected funding: truncated GitHub URL ciphertext");
                    return Err(ProgramError::InvalidArgument);
                }
                let auth_length = u32::from_le_bytes([
                    payload[auth_length_start],
                    payload[auth_length_start + 1],
                    payload[auth_length_start + 2],
                    payload[auth_length_start + 3],
                ]) as usize;
                let auth_start = auth_length_end;
                let auth_end = auth_start
                    .checked_add(auth_length)
                    .ok_or(ProgramError::InvalidArgument)?;
                if auth_end != payload.len()
                    || url_length < 2
                    || auth_length < 2
                    || payload[url_start] != 2
                    || payload[auth_start] != 2
                {
                    msg!("MergePay rejected funding: invalid GitHub DKG payloads");
                    return Err(ProgramError::InvalidArgument);
                }

                Ok((
                    payload[url_start..url_end].to_vec(),
                    payload[auth_start..auth_end].to_vec(),
                ))
            }

            fn valid_github_slug(&self, value: &str) -> bool {
                !value.is_empty()
                    && value.len() <= 100
                    && value.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric()
                            || byte == b'-'
                            || byte == b'_'
                            || byte == b'.'
                    })
            }

            fn valid_github_sha(&self, value: &str) -> bool {
                value.len() == 40
                    && value.bytes().all(|byte| byte.is_ascii_hexdigit())
            }

            fn valid_github_ref(&self, value: &str) -> bool {
                !value.is_empty()
                    && value.len() <= 128
                    && !value.starts_with('/')
                    && !value.ends_with('/')
                    && !value.contains("..")
                    && value.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric()
                            || byte == b'-'
                            || byte == b'_'
                            || byte == b'.'
                            || byte == b'/'
                    })
            }
        }
    }
}
