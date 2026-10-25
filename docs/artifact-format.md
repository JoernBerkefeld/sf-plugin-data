# Artifact format status

No artifact parser, serializer or deployable schema is implemented or published.
The approved direction is versioned JSON identified by logical data space, family
and API name, with exact companion SQL for calculated insights. The future file
layout is `data360/<logical-data-space>/<family>/<api-name>.json`.

Escaping, collision rules, writable projections and adapter interfaces are not
frozen by this bootstrap. Derive them from official API contracts and the first
DMO round trip. Do not treat this document as a schema or a saved execution plan.
