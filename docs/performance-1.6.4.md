# Browser payload budget

Version 1.6.4 uses the public zod/mini string constructor for its shared JSON-string wire codecs and minifies the client bundle. No MCP grants, credential storage, configuration writes or skill policies change.

The browser body must remain below 140000 bytes; builds exceeding that budget fail. Every invocation's parameter and result codecs are tested with valid strings and invalid objects/null.

This package does not bypass native DSH startup checks or disable functionality to obtain a smaller size.
