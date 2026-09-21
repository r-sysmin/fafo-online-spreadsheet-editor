// Inlined equivalent of `createUniver` from the upstream `@univerjs/presets`
// helper. Reproduced here so we can depend only on the OSS @univerjs/core
// package and drop the `@univerjs/presets` umbrella (which transitively pulls
// commercial `@univerjs-pro/*` packages via the advanced/collaboration
// presets we don't use). Upstream source: @univerjs/presets/lib/es/index.js
// (Apache-2.0).
import {
  IAuthzIoService,
  IMentionIOService,
  IUndoRedoService,
  LogLevel,
  Univer,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/lib/facade";

// Types intentionally loose to mirror upstream's untyped API surface.
type AnyPlugin = any;
type PresetEntry = { plugins: any[] } | [{ plugins: any[] }, unknown];
type CreateUniverOptions = {
  presets?: PresetEntry[];
  plugins?: any[];
  collaboration?: boolean;
  override?: any[];
  [key: string]: unknown;
};

export function createUniver(options: CreateUniverOptions) {
  const {
    presets,
    plugins,
    collaboration,
    override = [],
    ...rest
  } = options;

  if (collaboration) {
    override.push([IUndoRedoService, null]);
    override.push([IAuthzIoService, null]);
    override.push([IMentionIOService, null]);
  }

  const univer = new Univer({
    logLevel: LogLevel.WARN,
    ...rest,
    override,
  });

  const registry = new Map<string, { plugin: AnyPlugin; options: unknown }>();

  presets?.forEach((entry) => {
    const preset = Array.isArray(entry) ? entry[0] : entry;
    preset.plugins.forEach((p: any) => {
      const [plugin, opts] = Array.isArray(p) ? [p[0], p[1]] : [p, undefined];
      if (registry.has(plugin.pluginName)) registry.delete(plugin.pluginName);
      registry.set(plugin.pluginName, { plugin, options: opts });
    });
  });

  plugins?.forEach((entry) => {
    const [plugin, opts] = Array.isArray(entry) ? [entry[0], entry[1]] : [entry, undefined];
    if (registry.has(plugin.pluginName)) {
      throw new Error(
        `Plugin ${plugin.pluginName} already registered by presets or other ways!`,
      );
    }
    registry.set(plugin.pluginName, { plugin, options: opts });
  });

  registry.forEach(({ plugin, options: opts }) => {
    univer.registerPlugin(plugin, opts);
  });

  const univerAPI = FUniver.newAPI(univer);
  return { univer, univerAPI };
}
