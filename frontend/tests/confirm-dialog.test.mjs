// Account deletion and person deletion used window.confirm(). WebViews and
// embedded browsers can suppress native JS dialogs, in which case confirm()
// returns false without showing anything and the button silently does nothing
// — a reported "nothing happens" on Delete my account, and an App Review
// risk (Guideline 5.1.1(v): account deletion must work). These guard the
// in-page ConfirmDialog replacement.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => readFileSync(path.join(root, rel), 'utf8')
const dialog = read('../components/ConfirmDialog.tsx')
const account = read('../app/(app)/account/page.tsx')
const people = read('../app/(app)/people/page.tsx')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

test('no screen relies on window.confirm/alert/prompt (they fail silently in WebViews)', () => {
  const offenders = []
  for (const file of [...sourceFiles(path.join(root, '../app')), ...sourceFiles(path.join(root, '../components'))]) {
    // Strip comments first: ConfirmDialog's own doc comment names window.confirm().
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    if (/(^|[^a-zA-Z.])(window\.)?(confirm|alert|prompt)\(/m.test(src)) offenders.push(path.relative(path.join(root, '..'), file))
  }
  assert.deepEqual(offenders, [])
})

test('ConfirmDialog is an accessible alertdialog with a safe default focus', () => {
  assert.match(dialog, /role="alertdialog"/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /aria-labelledby="confirm-dialog-title"/)
  assert.match(dialog, /cancelRef\.current\?\.focus\(\)/, 'focus starts on Cancel, not the destructive button')
  assert.match(dialog, /e\.key === 'Escape'/)
  assert.match(dialog, /e\.key !== 'Tab'/, 'focus trapped while open')
  assert.match(dialog, /role="alert"/, 'errors are announced')
})

test('the dialog cannot be dismissed while the request is in flight', () => {
  assert.match(dialog, /e\.key === 'Escape' && !busy/)
  assert.match(dialog, /onClick=\{\(\) => \{ if \(!busy\) onCancel\(\) \}\}/)
})

test('Delete my account opens the dialog and only the confirm button calls the API', () => {
  assert.match(account, /import ConfirmDialog/)
  assert.match(account, /setConfirmOpen\(true\)/)
  assert.match(account, /onConfirm=\{deleteAccount\}/)
  // the click on the visible button must NOT delete directly
  assert.doesNotMatch(account, /onClick=\{deleteAccount\}/)
  assert.match(account, /api\.account\.delete\(\)/)
})

test('a failed account deletion shows the error inside the dialog and stays open', () => {
  assert.match(account, /error=\{error\}/)
  assert.match(account, /catch \(e: unknown\) \{ setError\(\(e as Error\)\.message\); setDeleting\(false\) \}/)
})

test('deleting a person confirms in-page and only removes them from the list after the API succeeds', () => {
  assert.match(people, /import ConfirmDialog/)
  assert.match(people, /onDelete=\{\(\) => \{ setDeleteError\(''\); setConfirmingDelete\(true\) \}\}/)
  const remove = people.slice(people.indexOf('async function remove()'), people.indexOf('return (', people.indexOf('async function remove()')))
  const apiCall = remove.indexOf('await api.people.delete(target.id)')
  const listUpdate = remove.indexOf('setPeople(prev => prev.filter')
  assert.ok(apiCall !== -1 && listUpdate !== -1 && apiCall < listUpdate, 'list update must come after the awaited delete, inside the try')
  assert.doesNotMatch(remove, /\.catch\(/, 'the old swallow-and-remove-anyway pattern must not return')
})
