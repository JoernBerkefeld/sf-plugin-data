# `HTML_ESCAPED_FILE`

> The file holds HTML-escaped text (such as &amp; or &#39;) where the org holds the character itself; Salesforce would store the entities literally, so nothing was written. Retrieve the component again, or write the characters themselves.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | General                                 |
| **Commands** | `sf data360 deploy`                     |
| **Outcome**  | `blocked` — nothing was sent to the org |

## What it means

The plugin asks Salesforce for plain text, so a retrieved file holds labels, descriptions, formulas, SQL and filter values as Salesforce stores them. Salesforce stores what a write sends as is and never decodes HTML entities.

Before a deploy writes an existing component, the plugin compares each text of the file with the org's. When a text differs and decoding its HTML entities once (`&amp;` to `&`, `&lt;` to `<`, `&gt;` to `>`, `&quot;` to `"`, `&#39;` to `'`, `&#92;` to `\`, and numeric references) gives exactly the org's text, the file holds an HTML-escaped copy of that text. The message names the key path of the first such text.

The check is narrow: a text that equals the org's text (also one that holds an entity Salesforce stores itself) or that decodes to anything else is never refused. A new component (create) is not checked, since there is no org text to compare with.

## Why the plugin stops

Deploying the file would store the entities as literal characters (`AT&amp;T` instead of `AT&T`), and every later retrieve would read them back that way.

## How to fix

1. Retrieve the component again with `sf data360 retrieve` and deploy the retrieved file, or
2. write the characters themselves at the path the message names.

## Example output

```text
HTML_ESCAPED_FILE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The file holds HTML-escaped text at spec.description (an entity such as &amp; or &#39; where the org holds the character itself) that Salesforce would store literally, since it never decodes entities it is sent. Retrieve it again, or write the characters themselves; nothing was written.
Hint: The file holds HTML-escaped text (such as &amp; or &#39;) where the org holds the character itself; Salesforce would store the entities literally, so nothing was written. Retrieve the component again, or write the characters themselves.
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — a selected file is not valid for its type.
