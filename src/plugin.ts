/**
 * Named, idempotent plugins.
 *
 * A plugin is just a function `(channel) => extended channel` applied with
 * {@link Channel.use}. {@link definePlugin} additionally tags it with a stable
 * **name**, so `.use()` applies it **at most once** per channel — even if several
 * plugins each depend on it (a shared sub-plugin runs once). Plain functions stay
 * the simplest path; reach for `definePlugin` when a plugin must be deduplicated.
 *
 * ```ts
 * const withUser = definePlugin({
 *   name: "ws-asyncapi/user",
 *   setup: <C extends AnyChannel>(c: C) =>
 *     c.derive(({ request }) => ({ token: request.query.token })),
 * });
 *
 * // dependency: just `.use` it inside another plugin — dedup makes it run once
 * const withSession = definePlugin({
 *   name: "ws-asyncapi/session",
 *   setup: <C extends AnyChannel>(c: C) => c.use(withUser).onOpen(() => {}),
 * });
 *
 * channel.use(withUser).use(withSession); // withUser applied once, not twice
 * ```
 */

/** Symbol carrying a plugin's name on its function value (read by `.use`). */
export const PLUGIN_NAME: unique symbol = Symbol.for("ws-asyncapi.plugin.name");

/** A plugin function tagged with a stable name for idempotent application. */
export type NamedPlugin<Setup> = Setup & { readonly [PLUGIN_NAME]: string };

/**
 * Tag a plugin with a stable `name` so {@link Channel.use} applies it at most once
 * per channel. `setup` is the plugin body — `(channel) => extended channel`.
 *
 * The same typing rules as `.use` apply: inline-shaped and hook-only setups keep
 * full typing; reusable setups that add context/contract run at runtime but their
 * added types don't thread through a by-reference application.
 */
export function definePlugin<Setup extends (channel: never) => unknown>(options: {
    name: string;
    setup: Setup;
}): NamedPlugin<Setup> {
    const plugin = options.setup as NamedPlugin<Setup>;
    Object.defineProperty(plugin, PLUGIN_NAME, {
        value: options.name,
        enumerable: false,
    });
    return plugin;
}

/** Read a plugin's name, if it was created with {@link definePlugin}. */
export function pluginName(plugin: unknown): string | undefined {
    return typeof plugin === "function"
        ? (plugin as Partial<Record<typeof PLUGIN_NAME, string>>)[PLUGIN_NAME]
        : undefined;
}
