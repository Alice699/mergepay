const PROGRAM_SOURCE: &str = include_str!("../src/lib.rs");
const AMOUNT: u64 = 1_000_000_000;
const DEADLINE: u64 = 2_000_000_000_000;

#[derive(Clone, Copy)]
enum RexVote {
    Merged,
    NotMerged404,
    RateLimited,
    Timeout,
    Malformed,
}

#[derive(Clone, Copy, Debug, Default)]
struct SettlementModel {
    funded: bool,
    merge_confirmed: bool,
    paid: bool,
    refunded: bool,
    workflow_escrow: u64,
    sponsor_received: u64,
    beneficiary_received: u64,
    transfers: u8,
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

        let output_count = votes.len();
        if output_count == 0 {
            return;
        }
        let merged_count = votes
            .iter()
            .filter(|vote| matches!(vote, RexVote::Merged))
            .count();
        let not_merged_count = votes
            .iter()
            .filter(|vote| matches!(vote, RexVote::NotMerged404))
            .count();

        if not_merged_count == output_count || merged_count != output_count {
            return;
        }

        self.workflow_escrow -= AMOUNT;
        self.beneficiary_received += AMOUNT;
        self.merge_confirmed = true;
        self.paid = true;
        self.transfers += 1;
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
        "for output in report.outputs()",
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
fn program_source_keeps_rex_failures_fail_closed() {
    let payout = program_section("handler fn handle_merge_response", "control fn refund");
    for required_guard in [
        "status == 404",
        "RexOutput::RexError(error)",
        "RexOutput::UnserializableResponse(error)",
        "if output_count == 0",
        "if not_merged_count == output_count",
        "if merged_count != output_count",
    ] {
        assert!(
            payout.contains(required_guard),
            "missing fail-closed REX guard: {required_guard}"
        );
    }
    assert_ordered(
        payout,
        "if merged_count != output_count",
        "self.merge_confirmed = true",
    );
}

#[test]
fn duplicate_callbacks_and_refunds_transfer_escrow_once() {
    let mut paid = SettlementModel::default();
    assert!(paid.fund());
    assert!(!paid.fund(), "duplicate funding must be rejected");
    paid.handle_merge_response((DEADLINE - 1) as i64, &[RexVote::Merged; 3]);
    paid.handle_merge_response((DEADLINE - 1) as i64, &[RexVote::Merged; 3]);
    assert!(!paid.execute_refund(DEADLINE as i64, true));
    paid.assert_invariants();
    assert_eq!(paid.transfers, 1);

    let mut refunded = SettlementModel::default();
    assert!(refunded.fund());
    assert!(refunded.execute_refund(DEADLINE as i64, true));
    assert!(refunded.execute_refund((DEADLINE + 1) as i64, true));
    refunded.handle_merge_response((DEADLINE - 1) as i64, &[RexVote::Merged; 3]);
    refunded.assert_invariants();
    assert_eq!(refunded.transfers, 1);
}

#[test]
fn deadline_boundary_deterministically_wins_the_race() {
    let mut callback_at_deadline = SettlementModel::default();
    callback_at_deadline.fund();
    callback_at_deadline.handle_merge_response(DEADLINE as i64, &[RexVote::Merged; 3]);
    callback_at_deadline.heartbeat(DEADLINE as i64);
    callback_at_deadline.assert_invariants();
    assert!(callback_at_deadline.refunded);

    let mut refund_first = SettlementModel::default();
    refund_first.fund();
    refund_first.heartbeat(DEADLINE as i64);
    refund_first.handle_merge_response((DEADLINE - 1) as i64, &[RexVote::Merged; 3]);
    refund_first.assert_invariants();
    assert!(refund_first.refunded);

    let mut merge_before_deadline = SettlementModel::default();
    merge_before_deadline.fund();
    merge_before_deadline.handle_merge_response((DEADLINE - 1) as i64, &[RexVote::Merged; 3]);
    merge_before_deadline.heartbeat(DEADLINE as i64);
    merge_before_deadline.assert_invariants();
    assert!(merge_before_deadline.paid);
}

#[test]
fn github_404_rate_limit_timeout_and_inconclusive_reports_never_pay() {
    let reports = [
        vec![RexVote::NotMerged404; 3],
        vec![RexVote::RateLimited; 3],
        vec![RexVote::Timeout; 3],
        vec![RexVote::Malformed; 3],
        vec![RexVote::Merged, RexVote::Merged, RexVote::NotMerged404],
        vec![RexVote::Merged, RexVote::RateLimited, RexVote::Merged],
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
                1 => model.handle_merge_response(now, &[RexVote::Merged; 3]),
                2 => model.handle_merge_response(now, &[RexVote::NotMerged404; 3]),
                3 => model.handle_merge_response(now, &[RexVote::RateLimited; 3]),
                4 => model.handle_merge_response(now, &[RexVote::Timeout; 3]),
                5 => model.handle_merge_response(
                    now,
                    &[RexVote::Merged, RexVote::Malformed, RexVote::Merged],
                ),
                6 => model.heartbeat(now),
                _ => {
                    model.execute_refund(now, true);
                }
            }
            model.assert_invariants();
        }
    }
}
