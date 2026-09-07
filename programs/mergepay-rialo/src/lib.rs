//! MergePay: a GitHub pull-request bounty escrow built with Rialo Venus.
//!
//! A sponsor publishes and funds a workflow PDA. A contributor claims it with a
//! separate wallet-owned record before Rialo REX checks GitHub's compact
//! `GET /repos/{owner}/{repo}/pulls/{number}/merge` endpoint. HTTP 204 means
//! merged, while HTTP 404 means not merged. A unanimous REX report releases
//! the escrow to the contributor approved by the sponsor.

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
                rent::Rent,
                system_instruction,
                system_program,
                sysvar::Sysvar,
            };
            use rialo_types::{RexError, RexOutput};

            initiating fn create_bounty(
                &mut self,
                beneficiary: Pubkey,
                github_owner: String,
                github_repo: String,
                pull_number: u64,
                amount_kelvin: u64,
                deadline_unix_ms: u64,
            ) -> ProgramResult {
                let current_unix_ms = self.unix_timestamp();
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
                if current_unix_ms < 0 || deadline_unix_ms <= current_unix_ms as u64 {
                    msg!("MergePay rejected create: deadline is not in the future");
                    return Err(ProgramError::InvalidArgument);
                }

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
                let target_account = ReadAccountInfo::from(target_workflow);
                if target_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }
                if !self.valid_github_slug(&claimant_github) || claimant_github_id == 0 {
                    msg!("MergePay rejected claim: invalid GitHub identity");
                    return Err(ProgramError::InvalidArgument);
                }

                let target_state = read_from_storage::<State>(&target_account.data.borrow())
                    .map_err(|_| ProgramError::InvalidAccountData)?;
                if target_state.claim_request
                    || target_state.sponsor == Pubkey::default()
                    || target_state.beneficiary != Pubkey::default()
                    || target_state.funded
                    || target_state.paid
                    || target_state.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }
                if target_state.sponsor == *self.payer_account().key {
                    msg!("MergePay rejected claim: sponsor cannot claim its own bounty");
                    return Err(ProgramError::InvalidArgument);
                }
                let current_unix_ms = self.unix_timestamp();
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
                if self.claim_request
                    || self.beneficiary == Pubkey::default()
                    || self.funded
                    || self.paid
                    || self.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }

                let payer_account = self.payer_account().clone();
                let workflow_account = self.accounts[1].clone();
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

                self.funded = true;
                AFTER self.deadline_unix_ms CALL [auto_refund];
                msg!(
                    "MergePay escrow funded with {} kelvin; native refund timer scheduled for {}",
                    self.amount_kelvin,
                    self.deadline_unix_ms
                );
                Ok(())
            }

            control fn accept_claim(&mut self, claim_workflow: Pubkey) -> ProgramResult {
                self.require_sponsor()?;
                if self.claim_request
                    || self.beneficiary != Pubkey::default()
                    || self.funded
                    || self.paid
                    || self.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }

                let claim_account = ReadAccountInfo::from(claim_workflow);
                if claim_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }
                let claim_state = read_from_storage::<State>(&claim_account.data.borrow())
                    .map_err(|_| ProgramError::InvalidAccountData)?;
                if !claim_state.claim_request
                    || claim_state.claim_target != *self.accounts[1].key
                    || claim_state.sponsor != self.sponsor
                    || claim_state.beneficiary == Pubkey::default()
                    || claim_state.github_owner != self.github_owner
                    || claim_state.github_repo != self.github_repo
                    || claim_state.pull_number != self.pull_number
                    || claim_state.amount_kelvin != self.amount_kelvin
                    || claim_state.deadline_unix_ms != self.deadline_unix_ms
                    || !self.valid_github_slug(&claim_state.claimant_github)
                    || claim_state.claimant_github_id == 0
                {
                    return Err(ProgramError::InvalidArgument);
                }

                let current_unix_ms = self.unix_timestamp();
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
                if !self.funded
                    || self.beneficiary == Pubkey::default()
                    || self.paid
                    || self.refunded
                {
                    return Err(ProgramError::InvalidArgument);
                }
                let current_unix_ms = self.unix_timestamp();
                if current_unix_ms < 0 || current_unix_ms as u64 > self.deadline_unix_ms {
                    return Err(ProgramError::InvalidArgument);
                }

                // A short native timer is supported by the current Venus
                // runtime and gives the handler a fresh branch number.
                AFTER 1 second CALL [run_merge_check];

                Ok(())
            }

            handler fn run_merge_check(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                if !self.funded
                    || self.beneficiary == Pubkey::default()
                    || self.paid
                    || self.refunded
                {
                    return Ok(());
                }
                let current_unix_ms = self.unix_timestamp();
                if current_unix_ms < 0 || current_unix_ms as u64 > self.deadline_unix_ms {
                    return Ok(());
                }

                self.checks += 1;
                msg!("MergePay merge check #{} scheduled", self.checks);

                let url = format!(
                    "https://api.github.com/repos/{}/{}/pulls/{}/merge",
                    self.github_owner,
                    self.github_repo,
                    self.pull_number
                );
                let headers = self.github_headers();
                let beneficiary = self.beneficiary;

                AFTER report = [http_get url: &url headers: &headers]
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

                let mut output_count = 0u64;
                let mut merged_count = 0u64;
                let mut not_merged_count = 0u64;

                for output in report.outputs() {
                    output_count += 1;
                    match output {
                        RexOutput::Success(_) => {
                            merged_count += 1;
                        }
                        RexOutput::RexError(RexError::HttpStatusError {
                            status,
                            ..
                        }) if status == 404 => {
                            not_merged_count += 1;
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
                    return Ok(());
                }

                if not_merged_count == output_count {
                    msg!("MergePay PR is not merged; escrow remains locked");
                    return Ok(());
                }

                if merged_count != output_count {
                    msg!(
                        "MergePay REX report was not unanimous: {}/{} merged",
                        merged_count,
                        output_count
                    );
                    return Ok(());
                }

                let workflow_account = self.accounts[1].clone();
                if workflow_account.owner != self.program_id {
                    return Err(ProgramError::IncorrectProgramId);
                }

                let rent_reserve = Rent::get()?.minimum_balance(workflow_account.data_len());
                let required_balance = rent_reserve
                    .checked_add(self.amount_kelvin)
                    .ok_or(ProgramError::InvalidArgument)?;
                if workflow_account.kelvins() < required_balance {
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
                self.execute_refund(true)
            }

            fn execute_refund(&mut self, enforce_deadline: bool) -> ProgramResult {
                let current_unix_ms = self.unix_timestamp();
                if !self.funded || self.paid || self.refunded {
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
                let rent_reserve = Rent::get()?.minimum_balance(workflow_account.data_len());
                let required_balance = rent_reserve
                    .checked_add(self.amount_kelvin)
                    .ok_or(ProgramError::InvalidArgument)?;
                if workflow_account.kelvins() < required_balance {
                    return Err(ProgramError::InsufficientFunds);
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
                    "MergePay status: funded={}, merged={}, paid={}, refunded={}, checks={}, claim_request={}, claimant=@{} (GitHub {})",
                    self.funded,
                    self.merge_confirmed,
                    self.paid,
                    self.refunded,
                    self.checks,
                    self.claim_request,
                    self.claimant_github,
                    self.claimant_github_id
                );
                Ok(())
            }

            handler fn auto_refund(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                self.execute_refund(false)
            }

            fn require_sponsor(&self) -> ProgramResult {
                if self.payer_account().key != &self.sponsor {
                    return Err(ProgramError::MissingRequiredSignature);
                }
                Ok(())
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

            fn github_headers(&self) -> rialo_types::Headers {
                let mut headers = std::collections::BTreeMap::new();
                headers.insert(
                    "Accept".to_string(),
                    rialo_types::RexValue::plain_string(
                        "application/vnd.github+json"
                    )
                );
                headers.insert(
                    "X-GitHub-Api-Version".to_string(),
                    rialo_types::RexValue::plain_string("2022-11-28")
                );
                headers.insert(
                    "User-Agent".to_string(),
                    rialo_types::RexValue::plain_string("MergePay-Rialo/0.1")
                );
                rialo_types::Headers::new(headers)
            }
        }
    }
}
