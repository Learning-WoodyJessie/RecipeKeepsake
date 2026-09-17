// Regression guard for the App Store Guideline 4 rejection (Sep 17 2026):
// "Sign in with Apple button includes logo artwork that is not downloaded
// from Apple Design Resources." Encodes the HIG requirements that were
// actually violated so a future edit can't silently reintroduce them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const pageSource = readFileSync(path.join(root, '../app/page.tsx'), 'utf8')
const logoPath = path.join(root, '../public/apple-signin-logo.svg')

// The old hand-drawn path Apple rejected — must never come back.
const OLD_HANDDRAWN_PATH_FRAGMENT = 'M788.1 340.9c-5.8 4.5-108.2 62.2-108.2'

// The exact `d` attribute from Apple's official
// "Sign in with Apple - Left Aligned - Black - Medium" SVG, downloaded from
// https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg
const OFFICIAL_LOGO_PATH_FRAGMENT = 'M15.7099491,14.8846154 C16.5675461,14.8846154 17.642562,14.3048315'

function extractAppleButtonBlock(source) {
  const start = source.indexOf('onClick={handleApple}')
  assert.ok(start !== -1, 'Apple sign-in button not found in page.tsx')
  const end = source.indexOf('</button>', start)
  return source.slice(start, end)
}

test('official Apple logo asset is present and unmodified', () => {
  assert.ok(existsSync(logoPath), 'frontend/public/apple-signin-logo.svg is missing')
  const svg = readFileSync(logoPath, 'utf8')
  assert.match(svg, /viewBox="0 0 31 44"/, 'unexpected viewBox — asset may have been re-exported or edited')
  assert.match(svg, new RegExp(OFFICIAL_LOGO_PATH_FRAGMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    'SVG path data does not match the official Apple asset — file may have been altered')
  assert.match(svg, /fill="#000000"/, 'logo fill must stay pure black, matching the black button style')
})

test('Apple button no longer contains the hand-drawn logo path', () => {
  assert.doesNotMatch(pageSource, new RegExp(OLD_HANDDRAWN_PATH_FRAGMENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('Apple button renders the downloaded asset, not an inline path', () => {
  const button = extractAppleButtonBlock(pageSource)
  assert.match(button, /src="\/apple-signin-logo\.svg"/)
  assert.doesNotMatch(button, /<path\s+d="/, 'button should not contain a hand-coded <path> for the Apple logo')
})

test('logo height matches button height (HIG: never crop, never add padding, match button height)', () => {
  const button = extractAppleButtonBlock(pageSource)
  const buttonMinHeight = button.match(/minHeight:\s*(\d+)/)?.[1]
  const logoHeight = button.match(/<img[^>]*style=\{\{[^}]*height:\s*(\d+)/)?.[1]
  assert.ok(buttonMinHeight, 'could not find button minHeight in style')
  assert.ok(logoHeight, 'could not find logo <img> height in style')
  assert.equal(logoHeight, buttonMinHeight, 'logo height must equal the button\'s base height per HIG')
})

test('button text does not wrap (would break the fixed-height/logo-height match on narrow viewports)', () => {
  const button = extractAppleButtonBlock(pageSource)
  assert.match(button, /whiteSpace:\s*'nowrap'/)
})

test('logo and title use pure black, not a custom color', () => {
  const button = extractAppleButtonBlock(pageSource)
  assert.match(button, /color:\s*'#000000'/, 'title color must be pure black')
  assert.match(button, /border:\s*'1\.5px solid #000000'/, 'border must be pure black')
  assert.doesNotMatch(button, /#1D1D1F/i, 'custom near-black color should no longer appear')
})

test('button title is one of the three Apple-approved strings', () => {
  const button = extractAppleButtonBlock(pageSource)
  const approved = ['Sign in with Apple', 'Sign up with Apple', 'Continue with Apple']
  const hasApproved = approved.some((title) => button.includes(title))
  assert.ok(hasApproved, `button text must be one of: ${approved.join(', ')}`)
})

test('Apple button is not smaller than the Google button (HIG: no smaller than other sign-in buttons)', () => {
  const appleButton = extractAppleButtonBlock(pageSource)
  const googleStart = pageSource.indexOf('onClick={handleGoogle}')
  const googleEnd = pageSource.indexOf('</button>', googleStart)
  const googleButton = pageSource.slice(googleStart, googleEnd)

  const appleHeight = Number(appleButton.match(/minHeight:\s*(\d+)/)?.[1])
  const googleHeight = Number(googleButton.match(/minHeight:\s*(\d+)/)?.[1])
  assert.ok(appleHeight > 0 && googleHeight > 0, 'could not read both button heights')
  assert.ok(appleHeight >= googleHeight, 'Apple button must not be shorter than the Google button')
})
