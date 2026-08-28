# Instructions

Typed builders for `create_bounty`, `fund`, `check_merge`, `refund`, and `status` live
here. They use the SDK's bincode writer, preserve the generated account order, validate
the same bounded GitHub slug format as the program, and attach the derived workflow
metadata needed by transaction and UI layers.
