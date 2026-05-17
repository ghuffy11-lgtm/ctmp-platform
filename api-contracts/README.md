# API Contracts

This folder owns the OpenAPI contract and shared API schemas.

Planned structure:

```text
openapi/    OpenAPI YAML/JSON files
schemas/    Shared request/response schema definitions
```

Important API rules:

- Do not expose commercial documents through generic file endpoints.
- Commercial opening must happen only through committee session endpoints.
- Commercial details require explicit commercial permissions even after opening.
- Late submission requires an active audited exception.
- All state-changing endpoints must create audit records.

