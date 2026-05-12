'use strict';

const INT_NON_EXISTENT_SENTINEL = -2147483648;

function placeholderForParent(parentIdType, fieldFormat) {
  if (fieldFormat === 'email') return { value: '${uniqEmail}', shape: 'email' };
  if (parentIdType === 'String') return { value: '${uniqUuid}', shape: 'uuid-string' };
  if (parentIdType === 'Int' || parentIdType === 'BigInt') return { value: INT_NON_EXISTENT_SENTINEL, shape: 'int-sentinel' };
  if (fieldFormat === 'uuid') return { value: '${uniqUuid}', shape: 'uuid-string' };
  return null;
}

function transformOverrides(rawOverrides, emitterKind, ctx) {
  const result = {};
  const diagnostics = [];
  if (!rawOverrides || typeof rawOverrides !== 'object') return { result, diagnostics };

  const zodFields = ctx.zodFieldsMap || {};
  const resourceGraph = ctx.resourceGraph;
  const endpoint = ctx.endpoint;

  for (const [fieldName, validValue] of Object.entries(rawOverrides)) {
    if (emitterKind === 'happy' || emitterKind === 'duplicate-conflict' || emitterKind === 'chain-roundtrip') {
      result[fieldName] = validValue;
      continue;
    }

    if (emitterKind === 'status-reach-404') {
      const fieldFormat = (zodFields[fieldName] && zodFields[fieldName].constraints && zodFields[fieldName].constraints.format) || null;
      const fkInfo = resourceGraph ? resourceGraph.fkLookup(fieldName) : null;
      const parentIdType = fkInfo && resourceGraph ? resourceGraph.parentIdType(fkInfo.parentModel) : null;
      const placeholder = placeholderForParent(parentIdType, fieldFormat);
      if (!placeholder) {
        diagnostics.push({
          code: 'OVERRIDE_TRANSFORM_UNTYPED',
          emitter: emitterKind,
          endpoint: endpoint ? `${endpoint.method} ${endpoint.path}` : null,
          field: fieldName,
          parentModel: fkInfo ? fkInfo.parentModel : null,
          message: `Override transform for ${emitterKind} cannot determine a non-existent placeholder for "${fieldName}": no Zod format declared AND no Prisma parent id type resolvable. Declare format (uuid/email) in Zod OR add @relation in Prisma so the parent's id column type is known.`,
        });
        result[fieldName] = '${uniqString}';
        continue;
      }
      result[fieldName] = placeholder.value;
      continue;
    }

    diagnostics.push({
      code: 'OVERRIDE_TRANSFORM_UNSUPPORTED',
      emitter: emitterKind,
      endpoint: endpoint ? `${endpoint.method} ${endpoint.path}` : null,
      field: fieldName,
      message: `Override transformer has no implementation for emitterKind="${emitterKind}". Add one in probes/body-overrides.js or use one of: happy, status-reach-404, duplicate-conflict, chain-roundtrip.`,
    });
    result[fieldName] = validValue;
  }

  return { result, diagnostics };
}

module.exports = { transformOverrides, INT_NON_EXISTENT_SENTINEL };
