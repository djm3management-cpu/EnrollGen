import test from 'node:test';
import assert from 'node:assert/strict';
import { engineFiles, engineBuilders, promptOptions } from './helpers/copilotPrompts.js';
import { buildCachedPrompt } from '../src/lib/llm/prompts.js';
import { toResponsesRequest } from '../src/lib/llm/openai.ts';
import { toAnthropicRequest } from '../src/lib/llm/anthropic.ts';

for (const engine of Object.keys(engineFiles)) {
  for (const name of ['buildCoachingSystemPrompt', 'buildAskSystemPrompt']) {
    test(`${engine} ${name}: prefix bytes survive section, mode, audio, RAG, template and transcript changes`, () => {
      const builder = engineBuilders(engine)[name];
      const first = buildCachedPrompt(builder, promptOptions(0));
      assert.ok(first.system[0].text.length > 0);
      for (let n = 1; n < 5; n++) {
        const next = buildCachedPrompt(builder, promptOptions(n));
        assert.equal(Buffer.compare(Buffer.from(first.system[0].text), Buffer.from(next.system[0].text)), 0);
        assert.notEqual(first.system[1].text, next.system[1].text);
        assert.notEqual(first.contextMessages[0].content, next.contextMessages[0].content);
        assert.ok(next.system[1].text.includes(`RAG ${n}`));
        assert.ok(!next.system[0].text.includes(`RAG ${n}`));
      }
    });
  }
}

test('provider cache boundaries preserve both prompt blocks and live message roles', () => {
  const prompt = buildCachedPrompt(engineBuilders('MA').buildCoachingSystemPrompt, promptOptions());
  const request = { engine: 'MA', system: prompt.system, messages: prompt.contextMessages };
  const openai = toResponsesRequest(request, 'gpt-5.6-luna');
  assert.deepEqual(openai.prompt_cache_options, { mode: 'explicit' });
  assert.deepEqual(openai.input[0].content[0].prompt_cache_breakpoint, { mode: 'explicit' });
  assert.equal(openai.input[0].content[1].prompt_cache_breakpoint, undefined);
  assert.equal(openai.input[0].content.map(b => b.text).join(''), prompt.system.map(b => b.text).join(''));
  assert.equal(openai.input[1].role, 'user');
  assert.equal(openai.input[1].content, request.messages[0].content);
  assert.ok(!JSON.stringify(openai).includes('cache_control'));
  assert.ok(!JSON.stringify(openai).includes('cache_prefix'));
  const anthropic = toAnthropicRequest(request, 'claude-sonnet-4-6');
  assert.equal(anthropic.system[0].cache_control.type, 'ephemeral');
  assert.equal(anthropic.system[1].cache_control, undefined);
  assert.equal(anthropic.system.map(b => b.text).join(''), prompt.system.map(b => b.text).join(''));
  assert.ok(!JSON.stringify(anthropic).includes('cache_prefix'));
});

test('unmarked classifier-style requests retain their previous provider body', () => {
  const body = toResponsesRequest({ engine: 'MA', path: 'summary', system: 'Classifier rules', messages: [{ role: 'user', content: 'Intents then transcript' }] }, 'gpt-5.6-luna');
  assert.deepEqual(body.input, [{ role: 'developer', content: 'Classifier rules' }, { role: 'user', content: 'Intents then transcript' }]);
  assert.equal(body.prompt_cache_options, undefined);
});
