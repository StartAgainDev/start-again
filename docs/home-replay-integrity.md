# Home replay integrity

This correction is development-only. It is not included in the isolated public hotfix, and it does not lock Home's provisional balance.

## Reproduced defects

- An eight-hour sleep followed by a 24-hour absence charged 86,340 hostile seconds instead of 57,600.
- A sleep ending ten seconds into a one-minute replay slice could protect the entire minute.
- Sleeping cleared already-accrued sabotage progress instead of freezing it.
- The crisis gate compared budget seconds rather than real seconds under weak POWER.

## Corrected behaviour

The simulation now carries a historical wall-clock cursor through each offline segment. It splits at sleep expiry, charges only the awake portion to sabotage, and retains the previously accrued sabotage budget while asleep.

Natural wake never awards an early-return refund. Life-support drain and baseline decay continue unchanged, and sleep entry uses the same POWER-scaled interpretation of real remaining time as emergency resume.

The existing save format already contains the sleep start time and duration, so no save migration or new balance constant is needed. Nap/night/long-rest durations, costs, and refund fractions remain provisional and unchanged.

## Validation

The Home suite contains 17 passing checks, including repeated partial resumes, exact expiry within a slice, the full eight-hour protection window, no natural-wake refund, preserved sabotage progress, and weak-POWER crisis refusal.

A Chromium fixture replaying a 24-hour absence after an eight-hour sleep produced exactly 57,600 hostile seconds and removed the completed sleep save. The Home menu remained usable afterward.
