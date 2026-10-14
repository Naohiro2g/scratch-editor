import MarkdownIt from 'markdown-it';

let source = '';
for await (const chunk of process.stdin) source += chunk;

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+[a-z0-9.]*$/.test(version)) {
    throw new Error('Guide version is invalid');
}

const markdown = new MarkdownIt({html: false, linkify: true});
const content = markdown.render(source);
process.stdout.write(`<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>はじめに — mc-remote Scratch ${version}</title>
<style>
body {margin: 0; background: #f3f8f6; color: #243439; font: 17px/1.7 system-ui, sans-serif;}
main {max-width: 800px; margin: 0 auto; padding: 20px 24px 72px;}
h1, h2 {line-height: 1.3;}
h1 {font-size: 1.7em;}
h2 {margin-top: 2em; border-top: 1px solid #c9dcd6; padding-top: .7em;}
a {color: #006e58;}
code {overflow-wrap: anywhere;}
li {margin-bottom: .5em;}
.version {color: #526b63;}
</style>
<main>
<p class="version">mc-remote Scratch ${version}</p>
${content}
</main>
</html>
`);
