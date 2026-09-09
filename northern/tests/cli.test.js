'use strict';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import net from 'node:net';
import { loadCli } from './helpers/keyboardPage.js';
import { REPO_ROOT, tmpDbPaths, seedSchema } from './helpers/db.js';

// Server reads server.key / server.crt relative to the working directory.
process.chdir(REPO_ROOT);

const { default: Server } = await import('../src/h2t/Server.js');

// Feature I1: the search command builds the LIKE pattern the server expects
describe('search command URL', () => {
    it('turns a plain path into a prefix search', () => {
        const cli = loadCli();

        assert.strictEqual(cli.call('searchUrl', '/md'), '/md?search=%25');
    });

    // The bug: '/%game?search=%' leaves the wildcard in the pathname, where it
    // reads as a malformed escape rather than as the pattern the user meant.
    it('carries a wildcard the user wrote in the query, percent encoded', () => {
        const cli = loadCli();

        assert.strictEqual(cli.call('searchUrl', '/%game'), '/?search=%25game%25');
    });

    it('keeps the literal part of the path in the path', () => {
        const cli = loadCli();

        assert.strictEqual(cli.call('searchUrl', '/md/%game'), '/md/?search=%25game%25');
    });

    it('leaves a pattern that already ends in a wildcard alone', () => {
        const cli = loadCli();

        assert.strictEqual(cli.call('searchUrl', '/md/%'), '/md/?search=%25');
    });

    it('encodes nothing else into the wildcard than the user typed', () => {
        const cli = loadCli();

        assert.strictEqual(cli.call('searchUrl', '/a/%b c'), '/a/?search=%25b%20c%25');
    });
});

// Feature I1: the wildcard has to be typable on a device with no hardware keys
describe('the on-screen keyboard', () => {
    it('offers a % key, so a wildcard search can be typed at all', () => {
        const source = fs.readFileSync(
            new URL('../src/fs/js/keyboard.js', import.meta.url), 'utf8');
        const layout = source.slice(source.indexOf('const keyLayout'), source.indexOf('];'));

        assert.match(layout, /"%"/);
    });
});

// Feature I1: match filters on the value, not on the path
describe('match command URL', () => {
    it('sends the keyword the server reads, wrapped so it matches anywhere in the value', () => {
        const cli = loadCli();

        assert.strictEqual(cli.call('matchUrl', '/md', 'gamepad'), '/md?keyword=%25gamepad%25');
    });

    // ?search wins the dispatch in Render.render, so sending both threw the
    // keyword away and match answered with every row under the path.
    it('does not send a search parameter, which would shadow the keyword', () => {
        const cli = loadCli();

        assert.ok(!cli.call('matchUrl', '/md', 'gamepad').includes('search='));
    });

    it('encodes a keyword that would otherwise break the query string', () => {
        const cli = loadCli();

        assert.strictEqual(cli.call('matchUrl', '/md', 'a&b'), '/md?keyword=%25a%26b%25');
    });
});

describe('running search and match from the command line', () => {
    const rows = JSON.stringify([{ path: '/md/b' }, { path: '/md/a' }]);

    it('fetches the search URL and writes the result into the first buffer', async () => {
        const cli = loadCli({ respond: () => rows });

        await cli.run('search /%game');

        assert.deepStrictEqual(cli.requests, ['/?search=%25game%25']);
        assert.deepStrictEqual(JSON.parse(cli.element('text').value).map(r => r.path), ['/md/a', '/md/b']);
    });

    it('sorts the hits by path, which the old comparator never did', async () => {
        const cli = loadCli({ respond: () => rows });

        await cli.run('search /md');

        assert.deepStrictEqual(JSON.parse(cli.element('text').value).map(r => r.path), ['/md/a', '/md/b']);
    });

    it('fetches the match URL with the path and the keyword kept apart', async () => {
        const cli = loadCli({ respond: () => rows });

        await cli.run('match /md gamepad');

        assert.deepStrictEqual(cli.requests, ['/md?keyword=%25gamepad%25']);
    });

    // ?keyword reads the values to filter on them; the listing does not show them.
    it('drops the values from the match listing, so it reads like a search', async () => {
        const hit = { path: '/md/a', type: 'txt', value: 'a note', counter: 0, author: 'alice', public: 'public' };
        const cli = loadCli({ respond: () => JSON.stringify([hit]) });

        await cli.run('match /md note');

        assert.deepStrictEqual(JSON.parse(cli.element('text').value), [
            { path: '/md/a', type: 'txt', counter: 0, author: 'alice', public: 'public' }
        ]);
    });

    it('lists the same columns as search, in the same order', async () => {
        const withValue = [{ path: '/md/a', type: 'txt', value: 'a note', counter: 0, author: 'alice', public: 'public' }];
        const withoutValue = [{ path: '/md/a', type: 'txt', counter: 0, author: 'alice', public: 'public' }];

        const matched = loadCli({ respond: () => JSON.stringify(withValue) });
        await matched.run('match /md note');
        const searched = loadCli({ respond: () => JSON.stringify(withoutValue) });
        await searched.run('search /md');

        assert.deepStrictEqual(
            Object.keys(JSON.parse(matched.element('text').value)[0]),
            Object.keys(JSON.parse(searched.element('text').value)[0]));
    });

    it('asks for the missing keyword rather than fetching', async () => {
        const cli = loadCli();

        await cli.run('match /md');

        assert.deepStrictEqual(cli.requests, []);
        assert.match(cli.element('footer').innerHTML, /Missing param/);
    });

    it('asks for the missing path rather than fetching undefined', async () => {
        const cli = loadCli();

        await cli.run('search');

        assert.deepStrictEqual(cli.requests, []);
        assert.match(cli.element('footer').innerHTML, /Missing param/);
    });
});

// The whole round trip: the URL the console builds, the server, and the LIKE
// pattern it ends up running.
describe('search and match over HTTP', () => {
    let server;
    let base;
    let dbFile;

    const ANON = { cookie: 'ssid=not-a-real-signature' };
    const get = p => fetch(`${base}${p}`, { headers: ANON, redirect: 'manual' });
    const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', body, headers: ANON, redirect: 'manual' });

    async function freePort() {
        const probe = net.createServer();
        await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
        const { port } = probe.address();
        await new Promise(resolve => probe.close(resolve));
        return port;
    }

    /** What the console would put on the wire for a typed command line. */
    const cli = loadCli();
    const urlFor = line => {
        const tokens = line.split(' ');
        return tokens[0] === 'match'
            ? cli.call('matchUrl', tokens[1], tokens[2])
            : cli.call('searchUrl', tokens[1]);
    };

    before(async () => {
        const paths = tmpDbPaths('cli.test.db');
        dbFile = paths.absolute;
        await seedSchema(dbFile);

        const httpPort = await freePort();
        server = new Server(httpPort, paths.relativeToSrcH2t, await freePort());
        base = `http://127.0.0.1:${httpPort}`;
        await new Promise(resolve => server.httpServer.once('listening', resolve));

        await post('/md/gamepad', 'a note about a gamepad');
        await post('/md/oldgame', 'a note about a game');
        await post('/md/recipe', 'nothing to do with play');
        await post('/other/gameboy', 'a note about a gameboy');
    });

    after(async () => {
        server.httpServer.closeAllConnections();
        server.sslServer.closeAllConnections();
        await new Promise(resolve => server.httpServer.close(resolve));
        await new Promise(resolve => server.sslServer.close(resolve));
        fs.rmSync(dbFile, { force: true });
    });

    it('lists everything under a path, as it always did', async () => {
        const rows = await (await get(urlFor('search /md'))).json();

        assert.deepStrictEqual(rows.map(r => r.path).sort(),
            ['/md/gamepad', '/md/oldgame', '/md/recipe']);
    });

    it('finds every path containing the wildcarded word, wherever it sits', async () => {
        const rows = await (await get(urlFor('search /%game'))).json();

        assert.deepStrictEqual(rows.map(r => r.path).sort(),
            ['/md/gamepad', '/md/oldgame', '/other/gameboy']);
    });

    it('keeps the wildcard inside the path it was given', async () => {
        const rows = await (await get(urlFor('search /md/%game'))).json();

        assert.deepStrictEqual(rows.map(r => r.path).sort(), ['/md/gamepad', '/md/oldgame']);
    });

    it('does not redirect the root away when the search starts there', async () => {
        const res = await get(urlFor('search /%game'));

        assert.strictEqual(res.status, 200);
    });

    it('match filters on the value, not on the path', async () => {
        const rows = await (await get(urlFor('match /md gamepad'))).json();

        assert.deepStrictEqual(rows.map(r => r.path), ['/md/gamepad']);
    });

    it('match stays inside its path prefix', async () => {
        const rows = await (await get(urlFor('match /md game'))).json();

        assert.deepStrictEqual(rows.map(r => r.path).sort(), ['/md/gamepad', '/md/oldgame']);
    });

    // The endpoint answers with the values it filtered on; the console drops
    // them, so its listing reads like a search.
    it('match finds the hit on a word that only the value carries', async () => {
        const [row] = await (await get(urlFor('match /md play'))).json();

        assert.strictEqual(row.path, '/md/recipe');
        assert.strictEqual(row.value, 'nothing to do with play');
    });

    // The path says "recipe", the value does not - match reads values only.
    it('match does not fall back to matching the path', async () => {
        const rows = await (await get(urlFor('match /md recipe'))).json();

        assert.deepStrictEqual(rows, []);
    });

    it('match answers with nothing when no value carries the keyword', async () => {
        const rows = await (await get(urlFor('match /md unicorn'))).json();

        assert.deepStrictEqual(rows, []);
    });

    // The whole thing wired together: the real command line, the real server,
    // and the buffer the user reads. A stub cannot tell us the two agree.
    describe('driving the real command line against the server', () => {
        const console_ = () => loadCli({ respond: url => get(url).then(res => res.text()) });

        it('search lists the wildcard hits', async () => {
            const page = console_();

            await page.run('search /%game');

            assert.deepStrictEqual(page.requests, ['/?search=%25game%25']);
            assert.deepStrictEqual(JSON.parse(page.element('text').value).map(r => r.path),
                ['/md/gamepad', '/md/oldgame', '/other/gameboy']);
        });

        it('match filters on the value but lists it the way search does', async () => {
            const page = console_();

            await page.run('match /md play');

            assert.deepStrictEqual(JSON.parse(page.element('text').value), [
                { path: '/md/recipe', type: 'txt', counter: 0, author: 'public', public: 'public' }
            ]);
        });
    });
});
