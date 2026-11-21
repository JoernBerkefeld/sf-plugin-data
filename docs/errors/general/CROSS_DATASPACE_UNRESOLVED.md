# `CROSS_DATASPACE_UNRESOLVED`

> A name in a file of another data space cannot be placed in the run's data space by rule, so nothing was sent. Read which name and why, change the selection or the file, then rerun.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | General                                                  |
| **Commands** | `sf data360 deploy --allow-cross-dataspace`              |
| **Outcome**  | `blocked` — nothing was sent to the org, no file written |

## What it means

This only matters when your org has more than one data space.

With `--allow-cross-dataspace` (`-c`), deploy translates files of another data space into the one of the run. It renames by fixed rules only:

- Custom DMOs and segments get, lose or swap the data space prefix (`Order__dlm` in `default` is `ds2_Order__dlm` in `dataspace2`).
- A standard DMO and its copy: `ssot__Individual__dlm` is `ds2_Individual__dlm`, and its fields lose `ssot__` (`ssot__FirstName__c` is `FirstName__c`). Key qualifier fields (`KQ_`) keep their names.
- Identity resolution outputs: `UnifiedssotIndividual<Id>__dlm` is `ds2_UnifiedIndividual<Id>__dlm` (the same for `UnifiedLink`) when their ruleset is in the same deploy. Otherwise the deploy reads the org's ruleset list once and takes the output of the one ruleset of the same type in the target data space.
- Data graph, data transform and ruleset names get, lose or swap the prefix (`Graph` is `ds2_Graph`; ruleset `Individual_t1` is `ds2_Individual_t1`).

A name that no rule places exactly is never guessed. Examples:

- `ds2_Order__dlm` deployed into `default`: it can be the copy of `ssot__Order__dlm` or `Order__dlm`, or a custom DMO `Order__dlm`.
- A packaged DMO (`ns__Thing__dlm`), or an identity resolution output without the `ssot` spelling (such as `UnifiedIndividual__dlm`).
- A name that already carries the prefix of another data space.
- A data space without a prefix in the org's list of data spaces.
- An identity resolution output when the target data space has no ruleset of that type, or several.
- In a data graph, ruleset or transform: any object or field name the translation does not cover, or a name still in the old spelling after the translation (`ssot__…` towards another data space). Salesforce accepts a graph left in the default spelling in another data space and builds it on the default objects, so such a name is refused instead of being sent.

## Why the plugin stops

A wrong name would create a component that does not belong to anything, or point a mapping or segment at the wrong object. So the whole deploy is refused before the first write, and the output lists every name it could not place, with the reason.

## How to fix

1. Read the `Cannot place` lines: each names the file, the place in the file and the reason.
2. For a custom DMO deployed into `default`, select its DMO file too: a retrieved custom DMO file shows creationType `Custom` on its fields, and that is enough.
3. Otherwise correct the file, leave it out of this deploy, or deploy it in its own data space.
4. Run `sf data360 deploy --preview -c` again until nothing is left, then deploy.

## Example output

```text
Deploy preview: blocked (CROSS_DATASPACE_UNRESOLVED). No deployment executed.
Translated from dataspace2: data360/dmo/ds2_Order__dlm.dmo-meta.json (dmo).
  c__dataSpace: dataspace2 -> default (data-space).
  Cannot place identity.apiName: ds2_Order__dlm (in default it is either the standard DMO ssot__Order__dlm or Order__dlm, or a custom DMO Order__dlm; select its DMO file (a custom DMO's fields show creationType Custom), or deploy it into another data space).
CROSS_DATASPACE_UNRESOLVED: These names cannot be placed in default exactly, so nothing was sent: ...
Hint: A name in a file of another data space cannot be placed in the run's data space by rule, so nothing was sent. Read which name and why, change the selection or the file, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/CROSS_DATASPACE_UNRESOLVED.md
```

## Related codes

- [`CROSS_DATASPACE_UNSUPPORTED`](../general/CROSS_DATASPACE_UNSUPPORTED.md) — a kind of file the translation does not cover yet.
- [`DMO_DATASPACE_MISMATCH`](../dmo/DMO_DATASPACE_MISMATCH.md) — the file names another data space and the deploy runs without `--allow-cross-dataspace`.
