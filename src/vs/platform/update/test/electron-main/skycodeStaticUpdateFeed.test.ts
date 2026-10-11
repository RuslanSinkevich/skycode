/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// [SKYCODE] Обновления из GitHub Releases без своего сервера (см. createUpdateURL).

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createUpdateURL, isSameBuildUpdate, isStaticUpdateFeed } from '../../electron-main/abstractUpdateService.js';

suite('Skycode static update feed', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const feed = 'https://github.com/RuslanSinkevich/skycode/releases/latest/download';

	test('detects the GitHub "latest release" feed', () => {
		assert.strictEqual(isStaticUpdateFeed(feed), true);
		assert.strictEqual(isStaticUpdateFeed(feed + '/'), true);
		assert.strictEqual(isStaticUpdateFeed('https://update.code.visualstudio.com'), false);
	});

	test('static feed points to update-<platform>.json, ignoring quality and commit', () => {
		assert.strictEqual(
			createUpdateURL(feed, 'win32-x64-user', 'stable', 'abc123', { background: true }),
			`${feed}/update-win32-x64-user.json`,
		);
		assert.strictEqual(
			createUpdateURL(feed + '/', 'win32-x64-user', 'stable', 'abc123'),
			`${feed}/update-win32-x64-user.json`,
		);
	});

	test('regular update server URL is unchanged', () => {
		assert.strictEqual(
			createUpdateURL('https://update.example.com', 'win32-x64-user', 'stable', 'abc123'),
			'https://update.example.com/api/update/win32-x64-user/stable/abc123?u=none',
		);
	});

	test('the same build is not an update', () => {
		assert.strictEqual(isSameBuildUpdate({ version: 'abc123' }, 'abc123'), true);
		assert.strictEqual(isSameBuildUpdate({ version: 'def456' }, 'abc123'), false);
		assert.strictEqual(isSameBuildUpdate(null, 'abc123'), false);
		assert.strictEqual(isSameBuildUpdate({ version: 'abc123' }, undefined), false);
	});
});
