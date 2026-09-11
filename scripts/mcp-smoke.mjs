/**
 * Read-only smoke test against a REAL Carbon Voice account.
 *
 *   npm run mcp:smoke
 *
 * Answers the question unit tests cannot: does this build actually work
 * against production data? It walks the tool chains the descriptions tell an
 * agent to walk — resolving a workspace id, then a conversation id, then a
 * message id — so a broken prerequisite shows up as a failed step rather than
 * as an agent quietly guessing.
 *
 * For every read it also calls the tool twice, once bare and once with the
 * `response_fields` set its own description recommends, and reports the byte
 * delta. That turns the projection claim into a measurement on your data
 * instead of on a fixture.
 *
 * SAFETY: every step is read-only. No tool that creates, updates, moves or
 * deletes anything is invoked, so running this cannot change your account.
 * Write paths are listed at the end with copy-paste commands, for you to run
 * deliberately.
 *
 * Needs stdio credentials — either CARBON_VOICE_PAT (preferred: expiring,
 * revocable, self-service) or CARBON_VOICE_API_KEY, from .env or the
 * environment — plus real network access.
 *
 * Read-only is a property of THIS SCRIPT, not of the credential: cv-api does
 * not enforce PAT scopes outside the app subscribe endpoints, so a cv:read PAT
 * can write like any other. Use a credential you are willing to revoke, not one
 * you believe is narrowed.
 */
import { bytes, connect, resultJson, resultText } from './lib/mcp-stdio.mjs';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

const pad = (s, n) => String(s).padEnd(n);
const num = (n) => n.toLocaleString();

const results = [];
let ctx = {};

const { call, close } = await connect();

/** Runs one read-only step; records pass/fail without aborting the run. */
const step = async (name, tool, buildArgs, extract) => {
  const row = {
    step: name,
    tool,
    status: 'skip',
    full: 0,
    narrowed: 0,
    note: '',
  };
  try {
    const toolArgs =
      typeof buildArgs === 'function' ? buildArgs(ctx) : buildArgs;
    if (toolArgs === null) {
      row.note = 'no id available from an earlier step';
      results.push(row);
      return;
    }

    const { result, error } = await call('tools/call', {
      name: tool,
      arguments: toolArgs,
    });

    if (error) {
      row.status = 'FAIL';
      row.note = `JSON-RPC: ${error.message ?? JSON.stringify(error)}`;
      results.push(row);
      return;
    }
    if (result.isError) {
      row.status = 'FAIL';
      const err = resultJson(result)?.body?.error;
      const status = resultJson(result)?.statusCode;
      // Surface the code and status, not just the message: the whole point of
      // a smoke test is telling apart a bad key (401 UNAUTHORIZED), no route
      // to the API (NETWORK_ERROR), and an actual defect. The generic
      // "An unexpected error occurred" message alone distinguishes none of
      // them.
      row.note =
        [status, err?.code, err?.message].filter(Boolean).join(' ') ||
        resultText(result).slice(0, 90) ||
        'isError';
      if (err?.next_action) row.note += ` | next: ${err.next_action}`;
      results.push(row);
      return;
    }

    row.full = bytes(result.content);
    const payload = resultJson(result);

    // Second call with the projection its own description recommends.
    const recommended = ctx.recommended?.[tool];
    if (recommended?.length) {
      const { result: narrow } = await call('tools/call', {
        name: tool,
        arguments: { ...toolArgs, response_fields: recommended },
      });
      if (!narrow?.isError) row.narrowed = bytes(narrow.content);
    }

    if (extract && payload !== undefined) {
      const learned = extract(payload) ?? {};
      ctx = { ...ctx, ...learned };
      const keys = Object.keys(learned).filter((k) => learned[k] !== undefined);
      if (keys.length)
        row.note = keys.map((k) => `${k}=${learned[k]}`).join(' ');
    }

    row.status = 'ok';
    if (verbose) {
      console.log(
        `\n--- ${tool} ---\n${resultText({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }).slice(0, 1500)}`,
      );
    }
    results.push(row);
  } catch (e) {
    row.status = 'FAIL';
    row.note = e.message;
    results.push(row);
  }
};

try {
  // Pull each tool's own recommended projection out of tools/list, so the
  // measurement uses exactly what an agent is told to use.
  const { result: listed } = await call('tools/list');
  ctx.recommended = Object.fromEntries(
    listed.tools.map((t) => {
      const line = (t.description || '')
        .split('\n')
        .find((l) => l.startsWith('NARROW: pass response_fields '));
      if (!line) return [t.name, []];
      const json = line.match(/\[.*\]/)?.[0];
      try {
        return [t.name, JSON.parse(json)];
      } catch {
        return [t.name, []];
      }
    }),
  );
  console.log(`connected: ${listed.tools.length} tools\n`);

  // --- identity and orientation -------------------------------------------
  await step('whoami', 'get_current_user', {}, (p) => ({
    userId: p?.user?.user_guid,
  }));
  await step('workspaces', 'get_workspaces_basic_info', {}, (p) => ({
    workspaceId: Array.isArray(p) ? p[0]?.id : undefined,
  }));

  // --- conversations -------------------------------------------------------
  await step('conversations', 'list_conversations', {}, (p) => ({
    conversationId: p?.results?.[0]?.id,
  }));
  await step('conversation', 'get_conversation', (c) =>
    c.conversationId ? { id: c.conversationId } : null,
  );
  await step('conversation users', 'get_conversation_users', (c) =>
    c.conversationId ? { id: c.conversationId } : null,
  );

  // --- messages ------------------------------------------------------------
  await step(
    'messages',
    'list_messages',
    (c) => ({
      size: 5,
      ...(c.workspaceId ? { workspace_id: c.workspaceId } : {}),
    }),
    (p) => ({ messageId: p?.results?.[0]?.id, total: p?.total }),
  );
  await step('recent messages', 'get_recent_messages', {});
  await step('message', 'get_message', (c) =>
    c.messageId ? { id: c.messageId } : null,
  );

  // --- folders -------------------------------------------------------------
  await step(
    'root folders',
    'get_root_folders',
    (c) => ({
      type: 'voicememo',
      ...(c.workspaceId ? { workspace_id: c.workspaceId } : {}),
    }),
    (p) => ({ folderId: p?.results?.[0]?.id }),
  );
  await step('folder', 'get_folder', (c) =>
    c.folderId ? { id: c.folderId, include_first_level_tree: true } : null,
  );

  // --- AI actions (read-only: listing and past responses only) -------------
  await step(
    'ai actions',
    'list_ai_actions',
    { owner_type: 'system' },
    (p) => ({
      promptId: Array.isArray(p) ? p[0]?.id : undefined,
    }),
  );
  await step('ai responses', 'get_ai_action_responses', { limit: 5 });

  // --- action items --------------------------------------------------------
  await step('my action items', 'list_my_action_items', { limit: 10 });
  await step('container action items', 'list_action_items', (c) =>
    c.conversationId
      ? { container_type: 'channel', container_id: c.conversationId, limit: 10 }
      : null,
  );

  // --- search & notifications (the newly exposed capabilities) -------------
  await step('search message ids', 'search_message_ids', {
    notified_status: 'notified',
    limit: 10,
  });
  await step('unread search', 'search_messages_by_heard_status', {
    heardStatus: 'unheard',
    limit: 10,
  });
  await step('inbox notifications', 'list_inbox_notifications', {
    category: 'mentions',
    limit: 10,
  });

  // --- users ---------------------------------------------------------------
  await step('search users (self)', 'search_users', (c) =>
    c.userId ? { ids: [c.userId] } : null,
  );
  await step('get user (self)', 'get_user', (c) =>
    c.userId ? { id: c.userId } : null,
  );
} finally {
  // await: the HTTP client's close issues a DELETE to terminate the
  // server-side session, and the process must not exit before it lands.
  await close();
}

// --- report ----------------------------------------------------------------
console.log(
  pad('STEP', 24) +
    pad('TOOL', 34) +
    pad('STATUS', 8) +
    pad('FULL', 10) +
    pad('NARROWED', 10) +
    'NOTE',
);
console.log('-'.repeat(120));
results.forEach((r) => {
  console.log(
    pad(r.step, 24) +
      pad(r.tool, 34) +
      pad(r.status, 8) +
      pad(r.full ? num(r.full) : '-', 10) +
      pad(r.narrowed ? num(r.narrowed) : '-', 10) +
      r.note,
  );
});

const ok = results.filter((r) => r.status === 'ok');
const failed = results.filter((r) => r.status === 'FAIL');
const skipped = results.filter((r) => r.status === 'skip');

const projected = ok.filter((r) => r.narrowed > 0);
const fullSum = projected.reduce((s, r) => s + r.full, 0);
const narrowSum = projected.reduce((s, r) => s + r.narrowed, 0);

console.log(
  `\n${ok.length} ok, ${failed.length} failed, ${skipped.length} skipped (no id available)`,
);

if (ok.length === 0 && failed.length > 0) {
  const codes = [...new Set(failed.map((r) => r.note.split(' ')[1]))];
  console.log(
    [
      '',
      'Every call failed — this is almost certainly configuration, not code:',
      '  401 / UNAUTHORIZED  -> no valid stdio credential. Set CARBON_VOICE_PAT',
      '                         (cv_pat_...) or CARBON_VOICE_API_KEY. Neither',
      '                         may be an OAuth access token — that is a',
      '                         separate credential type and the lookup will',
      '                         not find it.',
      '                         A PAT whose scopes lack cv:read also lands',
      '                         here; these steps are all reads.',
      '  403 / FORBIDDEN     -> the key is valid but workspace access is not.',
      '                         cv-api ApiKeyStrategy resolves the user, then',
      '                         isAuthorizedForWorkspaceAccess refuses on SSO',
      '                         grounds. A different problem from a bad key.',
      '  NETWORK_ERROR       -> no route to the API from this machine',
      '  405 / UNKNOWN_ERROR -> an HTTP proxy is intercepting; axios needs a',
      '                         CONNECT tunnel, so check HTTPS_PROXY',
      `observed: ${codes.join(', ')}`,
    ].join('\n'),
  );
}
if (projected.length) {
  console.log(
    `projection over ${projected.length} tools: ${num(fullSum)} -> ${num(narrowSum)} bytes ` +
      `(${(((fullSum - narrowSum) / fullSum) * 100).toFixed(1)}% smaller)`,
  );
}

console.log(
  [
    '',
    'Write paths are NOT exercised — this script cannot change your account.',
    'To test them deliberately, one at a time:',
    '',
    '  npm run mcp:call -- create_voicememo_message \'{"transcript":"smoke test memo"}\'',
    '  npm run mcp:call -- create_action_item \'{"title":"smoke test item"}\'',
    '  npm run mcp:call -- set_action_item_status \'{"id":"<id>","status":"done"}\'',
    '  npm run mcp:call -- create_message_share_link \'{"shared_message_id":"<id>","share_type":"link","access_type":"public"}\'',
    '',
    'Each creates real data in your account. delete_action_item and',
    'delete_folder are destructive and are deliberately not suggested here.',
  ].join('\n'),
);

if (failed.length) process.exitCode = 1;
