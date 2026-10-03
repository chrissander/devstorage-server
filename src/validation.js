import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ApiError, fail } from './errors.js';
import { isObject } from './model.js';

export function validationDetails(errors) {
  return errors?.map(({ instancePath, schemaPath, keyword, message }) => ({
    path: instancePath || '/', schemaPath, keyword, message,
  }));
}

// Only visit schema positions: a default/example may legitimately contain "$ref".
function checkReferences(schema, root = schema, visited = new WeakSet()) {
  if (!isObject(schema) || visited.has(schema)) return;
  visited.add(schema);
  const visit = child => checkReferences(child, root, visited);
  if (Object.hasOwn(schema, '$async')) fail(422, 'INVALID_SCHEMA', 'Asynchrone Schemas werden nicht unterstützt.');
  if (Object.hasOwn(schema, '$ref') && (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#'))) {
    fail(422, 'INVALID_SCHEMA', 'Nur interne Schema-Referenzen sind erlaubt.');
  }
  if (typeof schema.$ref === 'string') {
    const fragment = decodeURIComponent(schema.$ref.slice(1));
    if (fragment.startsWith('/')) {
      // JSON Pointer may target a schema stored under a custom keyword. Check
      // that target too, without mistaking ordinary example data for schemas.
      let target = root;
      for (const part of fragment.slice(1).split('/')) {
        const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
        target = target !== null && typeof target === 'object' && Object.hasOwn(target, key) ? target[key] : undefined;
      }
      visit(target);
    }
  }
  if (Object.hasOwn(schema, '$schema') && !['http://json-schema.org/draft-07/schema#', 'http://json-schema.org/draft-07/schema'].includes(schema.$schema)) {
    fail(422, 'INVALID_SCHEMA', 'Es wird ausschließlich JSON Schema Draft-07 unterstützt.');
  }
  for (const key of ['additionalItems', 'additionalProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else']) {
    visit(schema[key]);
  }
  if (Array.isArray(schema.items)) schema.items.forEach(visit);
  else visit(schema.items);
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) schema[key].forEach(visit);
  }
  for (const key of ['properties', 'patternProperties', 'definitions', '$defs', 'dependencies']) {
    if (isObject(schema[key])) Object.values(schema[key]).forEach(visit);
  }
}

export function compileSchema(schema) {
  try {
    checkReferences(schema);
    // Separate from Fastify's request validator; no shared IDs or stale cache.
    const ajv = new Ajv({
      strict: false, allErrors: true, coerceTypes: false, useDefaults: false,
      removeAdditional: false, ownProperties: true, logger: false,
    });
    addFormats(ajv);
    if (!ajv.validateSchema(schema)) fail(422, 'INVALID_SCHEMA', 'Ungültiges Draft-07-Schema.', validationDetails(ajv.errors));
    return ajv.compile(schema);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    fail(422, 'INVALID_SCHEMA', 'Schema kann nicht kompiliert werden; Referenzen, Formate und Ausdrücke prüfen.');
  }
}

export function validateContent(validate, content, filename) {
  let valid;
  try { valid = validate(content); } catch { fail(422, 'SCHEMA_VALIDATION_FAILED', 'Schema konnte den Inhalt nicht validieren.'); }
  if (!valid) fail(422, 'SCHEMA_VALIDATION_FAILED', 'Inhalt entspricht nicht dem Schema.', {
    ...(filename ? { filename } : {}), errors: validationDetails(validate.errors),
  });
}
