/**
 * Build and publish a server→client Event through a {@link Backplane}.
 *
 * Shared by the adapters and the standalone emitter so the offset-stamping +
 * encoding logic lives in one place. Assigns a recovery offset when the
 * backplane supports it, encodes the Event frame once, then publishes — the
 * backplane fans it out to every node and appends it to the replay log.
 */
import type { Backplane } from "./backplane.ts";
import { type AnyFrame, type Codec, Frame } from "./wire.ts";

export async function publishEvent(
    backplane: Backplane,
    codec: Codec,
    topic: string,
    type: string,
    data: unknown,
    except?: string[],
): Promise<void> {
    const offset = backplane.assignOffset
        ? await backplane.assignOffset()
        : undefined;
    const frame: AnyFrame =
        offset !== undefined
            ? [Frame.Event, type, data, offset]
            : [Frame.Event, type, data];
    await backplane.publish(topic, codec.encode(frame), offset, except);
}
