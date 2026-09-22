---
name: WhatsApp webhook verification
description: Durable implementation constraints for Meta WhatsApp webhook callbacks.
---

Meta webhook verification has two separate security steps: the GET challenge uses a configured verify token, while POST callbacks use an HMAC signature derived from the app secret. The raw request bytes must be captured before JSON parsing so the signature can be checked correctly.

**Why:** Reconstructing the body from parsed JSON can change whitespace or property ordering and make a valid Meta signature fail; reusing the challenge token as the app secret would also weaken the boundary.

**How to apply:** Keep raw-body capture ahead of the JSON middleware, store the two configuration values in workspace secrets, and acknowledge valid callbacks quickly after recording their message status.