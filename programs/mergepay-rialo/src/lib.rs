//! MergePay: a GitHub pull-request bounty escrow built with Rialo Venus.
//!
//! A sponsor creates and funds a workflow PDA. Rialo REX checks GitHub's
//! compact `GET /repos/{owner}/{repo}/pulls/{number}/merge` endpoint:
//! HTTP 204 means merged, while HTTP 404 means not merged. A unanimous REX
//! report releases the escrow to the beneficiary selected by the sponsor.

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
        }

        program {
            use rialo_rex_processor_interface::state::RexReport;
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

                if beneficiary == Pubkey::default() {
                    msg!("MergePay rejected create: beneficiary is the default pubkey");
                    return Err(ProgramError::InvalidArgument);
                }
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

                msg!(
                    "MergePay bounty created: {}/{}#{} -> {} ({} kelvin)",
                    self.github_owner,
                    self.github_repo,
                    self.pull_number,
                    self.beneficiary,
                    self.amount_kelvin
                );
                Ok(())
            }

            control fn fund(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                if self.funded || self.paid || self.refunded {
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
                msg!("MergePay escrow funded with {} kelvin", self.amount_kelvin);
                Ok(())
            }

            control fn check_merge(&mut self) -> ProgramResult {
                self.require_sponsor()?;
                if !self.funded || self.paid || self.refunded {
                    return Err(ProgramError::InvalidArgument);
                }
                let current_unix_ms = self.unix_timestamp();
                if current_unix_ms < 0 || current_unix_ms as u64 > self.deadline_unix_ms {
                    return Err(ProgramError::InvalidArgument);
                }

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

                self.checks += 1;
                msg!("MergePay merge check #{} scheduled", self.checks);
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
                let current_unix_ms = self.unix_timestamp();
                if !self.funded
                    || self.paid
                    || self.refunded
                    || current_unix_ms < 0
                    || current_unix_ms as u64 <= self.deadline_unix_ms
                {
                    return Err(ProgramError::InvalidArgument);
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
                    "MergePay status: funded={}, merged={}, paid={}, refunded={}, checks={}",
                    self.funded,
                    self.merge_confirmed,
                    self.paid,
                    self.refunded,
                    self.checks
                );
                Ok(())
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
