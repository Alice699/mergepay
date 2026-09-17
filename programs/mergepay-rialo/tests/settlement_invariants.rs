const PROGRAM_SOURCE: &str = include_str!("../src/lib.rs");
const AMOUNT: u64 = 1_000_000_000;
const DEADLINE: u64 = 2_000_000_000_000;
const LOCKED_HEAD: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER_HEAD: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MERGE_COMMIT: &str = "cccccccccccccccccccccccccccccccccccccccc";
const LOCKED_BASE: &str = "main";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct SettlementProof {
    status: u64,
    head: &'static str,
    base_ref: &'static str,
    merge_commit: Option<&'static str>,
    ci_success: bool,
    approvals: u64,
}

impl SettlementProof {
    const fn passing() -> Self {
        Self {
            status: 6,
            head: LOCKED_HEAD,
            base_ref: LOCKED_BASE,
            merge_commit: Some(MERGE_COMMIT),
            ci_success: true,
            approvals: 2,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RexVote {
    Proof(SettlementProof),
    Error,
    Malformed,
}

#[derive(Clone, Copy, Debug)]
struct SettlementModel {
    funded: bool,
    merge_confirmed: bool,
    paid: bool,
    refunded: bool,
    workflow_escrow: u64,
    sponsor_received: u64,
    beneficiary_received: u64,
    transfers: u8,
    require_ci_success: bool,
    minimum_approvals: u64,
    proof_status: u64,
    proof_checked_at: u64,
    proof_merge_commit: Option<&'static str>,
}

impl Default for SettlementModel {
    fn default() -> Self {
        Self {
            funded: false,
            merge_confirmed: false,
            paid: false,
            refunded: false,
            workflow_escrow: 0,
            sponsor_received: 0,
            beneficiary_received: 0,
            transfers: 0,
            require_ci_success: true,
            minimum_approvals: 2,
            proof_status: 0,
            proof_checked_at: 0,
            proof_merge_commit: None,
        }
    }
}

impl SettlementModel {
    fn fund(&mut self) -> bool {
        if self.funded || self.paid || self.refunded {
            return false;
        }
        self.funded = true;
        self.workflow_escrow = AMOUNT;
        true
    }

    fn handle_merge_response(&mut self, now: i64, votes: &[RexVote]) {
        if !self.funded || self.paid || self.refunded || now < 0 || now as u64 >= DEADLINE {
            return;
        }

        let Some(RexVote::Proof(consensus)) = votes.first().copied() else {
            self.record_inconclusive(now as u64);
            return;
        };
        if votes
            .iter()
            .any(|vote| !matches!(vote, RexVote::Proof(proof) if proof == &consensus))
        {
            self.record_inconclusive(now as u64);
            return;
        }
        if !(1..=6).contains(&consensus.status)
            || !valid_sha(consensus.head)
            || !valid_ref(consensus.base_ref)
            || consensus.merge_commit.is_some_and(|sha| !valid_sha(sha))
        {
            self.record_inconclusive(now as u64);
            return;
        }

        self.proof_status = consensus.status;
        self.proof_checked_at = now as u64;
        self.proof_merge_commit = consensus.merge_commit;
        if consensus.status != 6 {
            return;
        }
        if consensus.head != LOCKED_HEAD
            || consensus.base_ref != LOCKED_BASE
            || !consensus.merge_commit.is_some_and(valid_sha)
            || (self.require_ci_success && !consensus.ci_success)
            || consensus.approvals < self.minimum_approvals
        {
            self.record_inconclusive(now as u64);
            return;
        }

        self.workflow_escrow -= AMOUNT;
        self.beneficiary_received += AMOUNT;
        self.merge_confirmed = true;
        self.paid = true;
        self.transfers += 1;
    }

    fn record_inconclusive(&mut self, now: u64) {
        self.proof_status = 7;
        self.proof_checked_at = now;
    }

    fn heartbeat(&mut self, now: i64) {
        if !self.funded || self.paid || self.refunded || now < 0 {
            return;
        }
        if now as u64 >= DEADLINE {
            self.execute_refund(now, false);
        }
    }

    fn execute_refund(&mut self, now: i64, enforce_deadline: bool) -> bool {
        if self.refunded {
            return true;
        }
        if !self.funded || self.paid || now < 0 {
            return false;
        }
        if (now as u64) < DEADLINE {
            return !enforce_deadline;
        }

        self.workflow_escrow -= AMOUNT;
        self.sponsor_received += AMOUNT;
        self.refunded = true;
        self.transfers += 1;
        true
    }

    fn assert_invariants(&self) {
        assert!(
            !(self.paid && self.refunded),
            "terminal states must be exclusive"
        );
        assert!(
            self.transfers <= 1,
            "escrow can leave the workflow only once"
        );
        assert_eq!(
            self.workflow_escrow + self.sponsor_received + self.beneficiary_received,
            AMOUNT,
            "the committed escrow must be conserved"
        );
        if self.paid {
            assert!(self.funded && self.merge_confirmed);
            assert_eq!(self.proof_status, 6);
            assert!(self.proof_merge_commit.is_some_and(valid_sha));
            assert_eq!(self.beneficiary_received, AMOUNT);
            assert_eq!(self.sponsor_received, 0);
        }
        if self.refunded {
            assert!(self.funded && !self.merge_confirmed);
            assert_eq!(self.sponsor_received, AMOUNT);
            assert_eq!(self.beneficiary_received, 0);
        }
    }
}

fn valid_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_ref(value: &str) -> bool {
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

fn program_section(start: &str, end: &str) -> &'static str {
    let start_index = PROGRAM_SOURCE
        .find(start)
        .unwrap_or_else(|| panic!("missing program section: {start}"));
    let remainder = &PROGRAM_SOURCE[start_index..];
    let end_index = remainder
        .find(end)
        .unwrap_or_else(|| panic!("missing program section terminator: {end}"));
    &remainder[..end_index]
}

fn assert_ordered(section: &str, earlier: &str, later: &str) {
    let earlier_index = section
        .find(earlier)
        .unwrap_or_else(|| panic!("missing guard: {earlier}"));
    let later_index = section
        .find(later)
        .unwrap_or_else(|| panic!("missing guarded action: {later}"));
    assert!(
        earlier_index < later_index,
        "`{earlier}` must execute before `{later}`"
    );
}

#[test]
fn program_source_keeps_terminal_guards_before_balance_mutation() {
    let payout = program_section("handler fn handle_merge_response", "control fn refund");
    assert_ordered(
        payout,
        "if !self.funded || self.paid || self.refunded",
        "**workflow_account.try_borrow_mut_kelvins()? = workflow_balance",
    );
    assert_ordered(
        payout,
        "current_unix_ms as u64 >= self.deadline_unix_ms",
        "for update in &report.updates",
    );
    assert_ordered(
        payout,
        "proof_status != 6",
        "**beneficiary_account.try_borrow_mut_kelvins()? = beneficiary_balance",
    );
    assert_ordered(
        payout,
        "**beneficiary_account.try_borrow_mut_kelvins()? = beneficiary_balance",
        "self.paid = true",
    );

    let refund = program_section("fn execute_refund", "control fn status");
    assert_ordered(
        refund,
        "if self.refunded",
        "**workflow_account.try_borrow_mut_kelvins()? = workflow_balance",
    );
    assert_ordered(
        refund,
        "if !self.funded || self.paid",
        "**sponsor_account.try_borrow_mut_kelvins()? = sponsor_balance",
    );
    assert_ordered(
        refund,
        "(current_unix_ms as u64) < self.deadline_unix_ms",
        "self.refunded = true",
    );
}

#[test]
fn program_source_reserves_async_proof_storage_before_escrow() {
    let prepare = program_section("control fn prepare_funding", "fn require_sponsor");
    assert!(prepare.contains("self.reserve_proof_storage();"));

    let payout = program_section("handler fn handle_merge_response", "control fn refund");
    for fixed_field in [
        "fixed_proof_field(proof_head_sha, 40)",
        "fixed_proof_field(proof_base_ref, 128)",
        "fixed_proof_field(proof_merge_commit_sha, 40)",
    ] {
        assert!(
            payout.contains(fixed_field),
            "missing fixed proof slot: {fixed_field}"
        );
    }

    let refund = program_section("fn execute_refund", "control fn status");
    assert!(refund.contains("legacy storage resize"));
    assert!(refund.contains("self.refunded = true;"));
}

#[test]
fn custom_rex_and_callback_keep_every_ambiguous_result_fail_closed() {
    let rex = program_section("rex {", "program {");
    for required_check in [
        "/head/sha",
        "/base/ref",
        "merge_commit_sha",
        "/commits/{}/status",
        "check-runs?filter=latest",
        "/reviews?per_page=100",
        "commit_id == &expected_head_sha",
        "OWNER\" | \"MEMBER\" | \"COLLABORATOR",
        "COMMENTED\" | \"PENDING",
    ] {
        assert!(
            rex.contains(required_check),
            "missing strong REX check: {required_check}"
        );
    }

    let payout = program_section("handler fn handle_merge_response", "control fn refund");
    for required_guard in [
        "RexData::Raw(payload)",
        "if payload.len() > 512",
        "for update in &report.updates",
        "update.try_data_as_output()",
        "if success_count != output_count || !payloads_match",
        "fields.len() != 7",
        "proof_status != 6",
        "proof_head_sha != self.expected_head_sha",
        "proof_base_ref != self.expected_base_ref",
        "proof_approvals < self.minimum_approvals",
    ] {
        assert!(
            payout.contains(required_guard),
            "missing fail-closed REX guard: {required_guard}"
        );
    }
    assert_ordered(
        payout,
        "if success_count != output_count || !payloads_match",
        "self.merge_confirmed = true",
    );

    let check = program_section(
        "handler fn run_merge_check",
        "handler fn handle_merge_response",
    );
    assert!(
        check.contains("request_delay_ms: 15_000u64"),
        "the external GitHub REX duty must use a bounded production-sized collection window",
    );
}

#[test]
fn role_and_account_boundaries_are_checked_before_state_changes() {
    let create = program_section("initiating fn create_bounty", "initiating fn request_claim");
    assert!(create.contains("self.require_payer_signature()?"));
    assert!(create.contains("has_authorized_rex_bytecode_account"));

    let request = program_section("initiating fn request_claim", "control fn fund");
    assert!(request.contains("self.require_payer_signature()?"));
    assert!(request.contains("target_account.key != &target_workflow"));

    let accept = program_section("control fn accept_claim", "control fn check_merge");
    assert!(accept.contains("claim_account.key != &claim_workflow"));
    for state_flag in [
        "claim_state.funded",
        "claim_state.merge_confirmed",
        "claim_state.paid",
        "claim_state.refunded",
    ] {
        assert!(
            accept.contains(state_flag),
            "missing claim state guard: {state_flag}"
        );
    }

    for section in [
        program_section("control fn fund", "control fn accept_claim"),
        program_section("control fn check_merge", "handler fn run_merge_check"),
        program_section(
            "handler fn run_merge_check",
            "handler fn handle_merge_response",
        ),
        program_section("handler fn handle_merge_response", "control fn refund"),
        program_section("control fn refund", "fn execute_refund"),
        program_section("control fn prepare_funding", "fn require_payer_signature"),
    ] {
        assert!(section.contains("self.require_state_consistency()?"));
    }

    let helpers = program_section("fn require_payer_signature", "fn record_inconclusive_proof");
    assert!(helpers.contains("self.payer_account().is_signer"));
    assert!(helpers.contains("MergePay rejected inconsistent settlement state"));
}

#[test]
fn settlement_policy_and_rex_component_are_immutable_across_claims() {
    let create = program_section("initiating fn create_bounty", "initiating fn request_claim");
    for assignment in [
        "self.expected_head_sha = expected_head_sha",
        "self.expected_base_ref = expected_base_ref",
        "self.require_ci_success = require_ci_success",
        "self.minimum_approvals = minimum_approvals",
    ] {
        assert!(
            create.contains(assignment),
            "missing create policy lock: {assignment}"
        );
    }
    assert!(create.contains("self.__rex_bytecode_account == Pubkey::default()"));

    let request = program_section("initiating fn request_claim", "control fn fund");
    assert!(request.contains("self.expected_head_sha = target_state.expected_head_sha"));
    assert!(request.contains("self.expected_base_ref = target_state.expected_base_ref"));
    assert!(request.contains("target_state.__rex_bytecode_account != self.__rex_bytecode_account"));

    let accept = program_section("control fn accept_claim", "control fn check_merge");
    for comparison in [
        "claim_state.expected_head_sha != self.expected_head_sha",
        "claim_state.expected_base_ref != self.expected_base_ref",
        "claim_state.require_ci_success != self.require_ci_success",
        "claim_state.minimum_approvals != self.minimum_approvals",
        "claim_state.__rex_bytecode_account != self.__rex_bytecode_account",
    ] {
        assert!(
            accept.contains(comparison),
            "missing claim policy guard: {comparison}"
        );
    }
}

#[test]
fn duplicate_callbacks_and_refunds_transfer_escrow_once() {
    let pass = RexVote::Proof(SettlementProof::passing());
    let mut paid = SettlementModel::default();
    assert!(paid.fund());
    assert!(!paid.fund(), "duplicate funding must be rejected");
    paid.handle_merge_response((DEADLINE - 1) as i64, &[pass; 3]);
    paid.handle_merge_response((DEADLINE - 1) as i64, &[pass; 3]);
    assert!(!paid.execute_refund(DEADLINE as i64, true));
    paid.assert_invariants();
    assert_eq!(paid.transfers, 1);

    let mut refunded = SettlementModel::default();
    assert!(refunded.fund());
    assert!(refunded.execute_refund(DEADLINE as i64, true));
    assert!(refunded.execute_refund((DEADLINE + 1) as i64, true));
    refunded.handle_merge_response((DEADLINE - 1) as i64, &[pass; 3]);
    refunded.assert_invariants();
    assert_eq!(refunded.transfers, 1);
}

#[test]
fn deadline_boundary_deterministically_wins_the_race() {
    let pass = RexVote::Proof(SettlementProof::passing());
    let mut callback_at_deadline = SettlementModel::default();
    callback_at_deadline.fund();
    callback_at_deadline.handle_merge_response(DEADLINE as i64, &[pass; 3]);
    callback_at_deadline.heartbeat(DEADLINE as i64);
    callback_at_deadline.assert_invariants();
    assert!(callback_at_deadline.refunded);

    let mut refund_first = SettlementModel::default();
    refund_first.fund();
    refund_first.heartbeat(DEADLINE as i64);
    refund_first.handle_merge_response((DEADLINE - 1) as i64, &[pass; 3]);
    refund_first.assert_invariants();
    assert!(refund_first.refunded);

    let mut merge_before_deadline = SettlementModel::default();
    merge_before_deadline.fund();
    merge_before_deadline.handle_merge_response((DEADLINE - 1) as i64, &[pass; 3]);
    merge_before_deadline.heartbeat(DEADLINE as i64);
    merge_before_deadline.assert_invariants();
    assert!(merge_before_deadline.paid);
}

#[test]
fn force_push_base_change_and_missing_merge_commit_never_pay() {
    let scenarios = [
        SettlementProof {
            status: 2,
            head: OTHER_HEAD,
            ..SettlementProof::passing()
        },
        SettlementProof {
            status: 6,
            head: OTHER_HEAD,
            ..SettlementProof::passing()
        },
        SettlementProof {
            status: 3,
            base_ref: "release",
            ..SettlementProof::passing()
        },
        SettlementProof {
            status: 6,
            base_ref: "release",
            ..SettlementProof::passing()
        },
        SettlementProof {
            status: 6,
            merge_commit: None,
            ..SettlementProof::passing()
        },
    ];

    for proof in scenarios {
        let mut model = SettlementModel::default();
        model.fund();
        model.handle_merge_response((DEADLINE - 1) as i64, &[RexVote::Proof(proof); 3]);
        model.assert_invariants();
        assert!(!model.paid);
        assert_eq!(model.workflow_escrow, AMOUNT);
    }
}

#[test]
fn ci_rerun_and_current_commit_review_policy_only_pay_after_success() {
    let mut model = SettlementModel::default();
    model.fund();

    let ci_pending = SettlementProof {
        status: 4,
        ci_success: false,
        approvals: 0,
        ..SettlementProof::passing()
    };
    model.handle_merge_response((DEADLINE - 3) as i64, &[RexVote::Proof(ci_pending); 3]);
    assert!(!model.paid);
    assert_eq!(model.proof_status, 4);

    let stale_review = SettlementProof {
        status: 5,
        approvals: 1,
        ..SettlementProof::passing()
    };
    model.handle_merge_response((DEADLINE - 2) as i64, &[RexVote::Proof(stale_review); 3]);
    assert!(!model.paid);
    assert_eq!(model.proof_status, 5);

    let pass = RexVote::Proof(SettlementProof::passing());
    model.handle_merge_response((DEADLINE - 1) as i64, &[pass; 3]);
    model.assert_invariants();
    assert!(model.paid);
    assert_eq!(model.proof_merge_commit, Some(MERGE_COMMIT));
}

#[test]
fn github_failures_malformed_and_non_unanimous_reports_never_pay() {
    let pass = RexVote::Proof(SettlementProof::passing());
    let not_merged = RexVote::Proof(SettlementProof {
        status: 1,
        merge_commit: None,
        ci_success: false,
        approvals: 0,
        ..SettlementProof::passing()
    });
    let reports = [
        vec![not_merged; 3],
        vec![RexVote::Error; 3],
        vec![RexVote::Malformed; 3],
        vec![pass, pass, not_merged],
        vec![pass, RexVote::Error, pass],
        Vec::new(),
    ];

    for report in reports {
        let mut model = SettlementModel::default();
        model.fund();
        model.handle_merge_response((DEADLINE - 1) as i64, &report);
        model.assert_invariants();
        assert!(!model.paid);
        assert!(!model.refunded);
        assert_eq!(model.workflow_escrow, AMOUNT);
    }
}

#[test]
fn deterministic_fault_sequences_preserve_terminal_exclusivity_and_value() {
    let pass = RexVote::Proof(SettlementProof::passing());
    let not_merged = RexVote::Proof(SettlementProof {
        status: 1,
        merge_commit: None,
        ci_success: false,
        approvals: 0,
        ..SettlementProof::passing()
    });
    for seed in 0_u64..4_096 {
        let mut model = SettlementModel::default();
        model.fund();
        let mut value = seed.wrapping_add(1);

        for _ in 0..16 {
            value = value
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let now = match (value >> 8) % 3 {
                0 => (DEADLINE - 1) as i64,
                1 => DEADLINE as i64,
                _ => (DEADLINE + 1) as i64,
            };
            match value % 8 {
                0 => {
                    model.fund();
                }
                1 => model.handle_merge_response(now, &[pass; 3]),
                2 => model.handle_merge_response(now, &[not_merged; 3]),
                3 => model.handle_merge_response(now, &[RexVote::Error; 3]),
                4 => model.handle_merge_response(now, &[RexVote::Malformed; 3]),
                5 => model.handle_merge_response(now, &[pass, RexVote::Malformed, pass]),
                6 => model.heartbeat(now),
                _ => {
                    model.execute_refund(now, true);
                }
            }
            model.assert_invariants();
        }
    }
}
