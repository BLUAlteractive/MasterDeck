import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Resolve through the mobile workspace and Expo, exactly as the CLI does.
const mobileRequire = createRequire(
  fileURLToPath(new URL('../apps/mobile/package.json', import.meta.url)),
);
const expoRequire = createRequire(mobileRequire.resolve('expo/package.json'));
const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
type Schema = {
  parse: (input: unknown) => unknown;
  safeParse: (input: unknown) => { success: boolean };
};
const { PluginSchema, DevToolsPluginOutputSchema } = cliRequire(
  './build/src/start/server/DevToolsPlugin.schema.js',
) as { PluginSchema: Schema; DevToolsPluginOutputSchema: Schema };
const { createMCPDevToolsExtensionSchema } = cliRequire(
  './build/src/start/server/createMCPDevToolsExtensionSchema.js',
) as { createMCPDevToolsExtensionSchema: (plugin: unknown) => Schema };
const { toJSONSchema } = cliRequire('zod') as {
  toJSONSchema: (schema: Schema) => Record<string, unknown>;
};
const plugin = {
  packageName: 'deckforge-test-plugin',
  packageRoot: '/tmp/deckforge-test-plugin',
  cliExtensions: {
    description: 'Compatibility fixture; never executed',
    entryPoint: './index.js',
    commands: [
      {
        name: 'inspect',
        title: 'Inspect',
        environments: ['cli', 'mcp'],
        parameters: [
          { name: 'label', type: 'text' },
          { name: 'count', type: 'number' },
          { name: 'enabled', type: 'confirm' },
        ],
      },
    ],
  },
};

describe('Expo CLI 58.1.16 compatibility with patched Zod 4', () => {
  it('resolves the exact reviewed CLI and patched Zod versions', () => {
    expect(cliRequire('./package.json').version).toBe('58.1.16');
    expect(cliRequire('zod/package.json').version).toBe('4.6.7');
  });

  it('accepts valid plugin descriptors and rejects malformed commands', () => {
    expect(PluginSchema.parse(plugin)).toEqual(plugin);
    expect(PluginSchema.safeParse({ ...plugin, packageName: '' }).success).toBe(
      false,
    );
    expect(
      PluginSchema.safeParse({
        ...plugin,
        cliExtensions: { ...plugin.cliExtensions, commands: [] },
      }).success,
    ).toBe(false);
  });

  it('validates all output variants and rejects invalid URLs and levels', () => {
    const output = [
      { type: 'text', text: 'Ready', level: 'info' },
      { type: 'audio', url: 'https://example.com/audio' },
      { type: 'image', url: 'https://example.com/image', text: 'Preview' },
    ];
    expect(DevToolsPluginOutputSchema.parse(output)).toEqual(output);
    for (const invalid of [
      [{ type: 'text', text: 'Ready', level: 'unknown' }],
      [{ type: 'audio', url: 'invalid' }],
      [{ type: 'image', url: 42 }],
    ]) {
      expect(DevToolsPluginOutputSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('preserves MCP command enums, parameter types and strict validation', () => {
    const schema = createMCPDevToolsExtensionSchema(plugin);
    const input = {
      command: 'inspect',
      label: 'test',
      count: 2,
      enabled: true,
    };
    expect(schema.parse(input)).toEqual(input);
    expect(schema.safeParse({ command: 'inspect' }).success).toBe(true);
    for (const invalid of [
      { command: 'unknown' },
      { ...input, count: '2' },
      { ...input, enabled: 'true' },
      { ...input, extra: true },
    ]) {
      expect(schema.safeParse(invalid).success).toBe(false);
    }
    expect(toJSONSchema(schema)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['command'],
      properties: {
        command: { type: 'string', enum: ['inspect'] },
        label: { type: 'string' },
        count: { type: 'number' },
        enabled: { type: 'boolean' },
      },
    });
  });

  it('rejects MCP plugins without commands', () => {
    expect(() =>
      createMCPDevToolsExtensionSchema({ ...plugin, cliExtensions: undefined }),
    ).toThrow('has no commands defined');
  });
});
