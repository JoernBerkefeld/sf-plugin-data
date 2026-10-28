// Synthetic qualified shapes only; no captured org identities or receipts.
/**
 * Build a detached synthetic qualified owner pair.
 * @param {string} ruleType Individual reconciliation variant.
 * @returns {object} Independent facade and native objects.
 */
export function irFixture(ruleType = 'mostfrequent') {
  const entities = [
    'Individual',
    'ContactPointEmail',
    'ContactPointPhone',
    'ContactPointAddress',
    'ContactPointApp',
    'PartyIdentification',
  ];
  const facade = {
    configurationType: 'individual',
    dataSpaceName: 'default',
    description: 'Synthetic configuration',
    doesRunAutomatically: false,
    filters: [],
    id: 'synthetic-owner-id',
    isCaseSensitive: true,
    label: 'Synthetic owner',
    objectApiName: 'Individual_A1b2',
    rulesetId: 'A1b2',
    rulesetStatus: 'PUBLISHED',
    secondaryDmo: 'ssot__Individual__dlm',
    matchRules: [
      {
        label: 'Synthetic ordered rule',
        criteria: [
          ['Individual', 'FirstName', 'fuzzy'],
          ['Individual', 'LastName', 'exact'],
          ['ContactPointEmail', 'EmailAddress', 'exactnormalized'],
        ].map(([entity, field, method]) => ({
          caseSensitiveMatch: false,
          entityName: `ssot__${entity}__dlm`,
          fieldName: `ssot__${field}__c`,
          matchMethodType: method,
          shouldMatchOnBlank: false,
        })),
      },
    ],
    reconciliationRules: entities.map((entity, index) => ({
      entityName: `ssot__${entity}__dlm`,
      fields: [],
      sources: [],
      ruleType: index === 0 ? ruleType : 'lastupdated',
      shouldIgnoreEmptyValue: true,
      unifiedDmoName: `SyntheticUnified${entity}__dlm`,
      linkDmoName: `SyntheticLink${entity}__dlm`,
    })),
  };
  const native = structuredClone(facade);
  delete native.filters;
  return { facade, native };
}
export const selection = { requested: '67.0', restSelector: 'v67.0', soapNumeric: '67.0' };
