import path from 'path';
import SeleniumHelper from '../helpers/selenium-helper';

const {
    getDriver,
    getLogs,
    loadUri,
    textExists
} = new SeleniumHelper();

const uri = path.resolve(__dirname, '../../build/index.html');

let driver;

describe('Working with the how-to library', () => {
    beforeAll(() => {
        driver = getDriver();
    });

    afterAll(async () => {
        await driver.quit();
    });

    test('Backpack is hidden without a configured host', async () => {
        await loadUri(uri);
        expect(await textExists('Backpack')).toBe(false);
        const logs = await getLogs();
        await expect(logs).toEqual([]);
    });
});
