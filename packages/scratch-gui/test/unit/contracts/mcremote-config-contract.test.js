const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const contractRoot = path.resolve(__dirname, '../../../contracts');
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const fixturePaths = directory => fs.readdirSync(directory)
    .filter(fileName => fileName.endsWith('.json'))
    .map(fileName => path.join(directory, fileName));

describe('McRemote configuration contracts', () => {
    const compileSchema = schemaPath => new Ajv({allErrors: true, strict: true}).compile(readJson(schemaPath));

    test('accepts the published runtime configuration fixtures', () => {
        const directory = path.join(contractRoot, 'runtime-config');
        const validate = compileSchema(path.join(directory, 'schema.json'));

        for (const filePath of fixturePaths(path.join(directory, 'fixtures'))) {
            expect({filePath, valid: validate(readJson(filePath)), errors: validate.errors}).toEqual({
                filePath,
                valid: true,
                errors: null
            });
        }
    });

    test('rejects every published invalid runtime configuration fixture', () => {
        const directory = path.join(contractRoot, 'runtime-config');
        const validate = compileSchema(path.join(directory, 'schema.json'));

        for (const filePath of fixturePaths(path.join(directory, 'fixtures/invalid'))) {
            expect({filePath, valid: validate(readJson(filePath))}).toEqual({filePath, valid: false});
        }
    });

    test('accepts and rejects the published product configuration fixtures', () => {
        const directory = path.join(contractRoot, 'product-config');
        const validate = compileSchema(path.join(directory, 'schema.json'));
        const validPath = path.join(directory, 'fixtures/valid.json');
        const invalidPaths = fixturePaths(path.join(directory, 'fixtures/invalid'));

        expect(validate(readJson(validPath))).toBe(true);
        for (const filePath of invalidPaths) {
            expect({filePath, valid: validate(readJson(filePath))}).toEqual({filePath, valid: false});
        }
    });

    test('ships schema-valid image-owned product data and a deployment-neutral disabled runtime', () => {
        const runtimeDirectory = path.join(contractRoot, 'runtime-config');
        const productDirectory = path.join(contractRoot, 'product-config');
        const validateRuntime = compileSchema(path.join(runtimeDirectory, 'schema.json'));
        const validateProduct = compileSchema(path.join(productDirectory, 'schema.json'));
        const runtime = readJson(path.resolve(__dirname, '../../../static/mc-remote-runtime-config.json'));
        const product = readJson(path.resolve(__dirname, '../../../static/mc-remote-product-config.json'));

        expect(validateRuntime(runtime)).toBe(true);
        expect(runtime).toEqual(readJson(path.join(runtimeDirectory, 'fixtures/disabled.json')));
        expect(validateProduct(product)).toBe(true);
    });
});
