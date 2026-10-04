// One-time source migration: explicit translation calls, no DOM rewriting.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../apps/web/src');
const attributes = new Set(['title','placeholder','label','tip','subtitle','aria-label','alt','description']);
const skipped = new Set(['layout.tsx','AppPreferences.tsx']);
const decode = text => text.replace(/&(quot|apos|amp|lt|gt|times|larr|rarr);/g, (_, key) => ({quot:'"',apos:"'",amp:'&',lt:'<',gt:'>',times:'×',larr:'←',rarr:'→'})[key]);
function migrate(file) {
  if (skipped.has(path.basename(file))) return;
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('from "@/lib/ui-language"')) return;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  let translated = 0;
  const edit = (start,end,text) => { edits.push({start,end,text}); translated++; };
  function isCode(node) {
    for (let parent=node.parent; parent; parent=parent.parent) {
      if (ts.isJsxElement(parent) && ['style','script','pre','code','ReactMarkdown'].includes(parent.openingElement.tagName.getText(sf))) return true;
    }
    return false;
  }
  function visit(node) {
    if (isCode(node)) return;
    if (ts.isJsxText(node)) {
      const text = decode(node.text.replace(/\s+/g,' ').trim());
      if (text && /[A-Za-z\u4e00-\u9fff]/.test(text)) edit(node.getStart(sf),node.end,'{tr('+JSON.stringify(text)+')}');
      return;
    }
    if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(sf)) && node.initializer) {
      const initial=node.initializer;
      if (ts.isStringLiteral(initial)) edit(initial.getStart(sf),initial.end,'{tr('+JSON.stringify(decode(initial.text))+')}');
      else if (ts.isJsxExpression(initial) && initial.expression) {
        const expression = initial.expression;
        edit(expression.getStart(sf),expression.end,'tr('+expression.getText(sf)+')');
      }
      return;
    }
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const expression=node.expression;
      const raw=expression.getText(sf);
      const hasJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || !!ts.forEachChild(n,hasJsx);
      if (!hasJsx(expression) && !/\b(?:prompt|message|msg|result|fullOutput|reviewResultText|text|suggestions|reviewText|diffStat|directory|workDir|cwd|previewUrl|changedFiles)\b|(?:agent|a|p|project)\.name/.test(raw)) {
        edit(expression.getStart(sf),expression.end,'trNode('+raw+')');
        return;
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(sf);
  if (!translated) return;
  function componentName(node) {
    if (ts.isFunctionDeclaration(node)) return node.name?.text ?? (node.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword) ? 'DefaultComponent' : '');
    if (!ts.isArrowFunction(node) && !ts.isFunctionExpression(node)) return '';
    let parent=node.parent;
    if (ts.isCallExpression(parent)) { if (parent.expression.getText(sf) === 'dynamic') return ''; parent=parent.parent; }
    return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) ? parent.name.text : '';
  }
  function hooks(node) {
    if ((ts.isFunctionDeclaration(node)||ts.isArrowFunction(node)||ts.isFunctionExpression(node)) && node.body) {
      const name=componentName(node);
      if (/^[A-Z]/.test(name) || name==='useConfirm') {
        const body=node.body;
        if (ts.isBlock(body)) edits.push({start:body.getStart(sf)+1,end:body.getStart(sf)+1,text:'\n  useLocale();'});
        // Keep concise forwardRef components reactive without changing hook order.
        else { edits.push({start:body.getStart(sf),end:body.getStart(sf),text:'{ useLocale(); return '}); edits.push({start:body.end,end:body.end,text:'; }'}); }
      }
    }
    ts.forEachChild(node,hooks);
  }
  hooks(sf);
  const insert=sf.statements[0] && ts.isExpressionStatement(sf.statements[0]) && ts.isStringLiteral(sf.statements[0].expression) ? sf.statements[0].end : 0;
  edits.push({start:insert,end:insert,text:(insert?'\n':'"use client";\n')+'import { tr, trNode, useLocale } from "@/lib/ui-language";\n'});
  edits.sort((a,b)=>b.start-a.start || b.end-a.end);
  let output=source;
  for(const e of edits) output=output.slice(0,e.start)+e.text+output.slice(e.end);
  fs.writeFileSync(file,output);
  console.log(path.relative(root,file),translated);
}
function scan(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())scan(file);else if(file.endsWith('.tsx'))migrate(file);}}
scan(root);
