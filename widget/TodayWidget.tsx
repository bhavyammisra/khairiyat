import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';

import { palette, radius, space, type ColorScheme } from '../lib/theme';
import type { DoseState } from '../lib/types';
import type { WidgetSnapshot } from '../lib/widget';

/**
 * A caregiver's glance: who has taken what today, and anything running out.
 *
 * Renders from the AsyncStorage snapshot only — no network, no session. Widget
 * layout is a restricted subset of RN with no SVG, so the Dose Ring becomes a
 * glyph; state is still carried by SHAPE as well as colour, and each row also
 * carries a plain "2 of 3" so nothing depends on reading the glyphs at all.
 *
 * Padding is set per-side: `padding` shorthand is unreliable here and lets
 * right-aligned children sit flush against the edge.
 */

/** Theme tokens are plain strings; the widget library wants `#rrggbb`. */
const hex = (value: string): ColorProp => value as ColorProp;

const GLYPH: Record<DoseState, string> = {
  pending: '○',
  confirmed: '●',
  unconfirmed: '◍',
  resolved_taken: '◐',
  resolved_missed: '⊗',
  resolved_unreachable: '⊘',
};

const shortTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

export function TodayWidget({
  snapshot,
  scheme = 'light',
}: {
  snapshot: WidgetSnapshot | null;
  scheme?: ColorScheme;
}) {
  const color = palette[scheme];

  const tone = (state: DoseState): string => {
    if (state === 'confirmed' || state === 'resolved_taken') return color.accent;
    if (state === 'unconfirmed') return color.amber;
    if (state === 'resolved_missed') return color.red;
    return color.borderStrong;
  };

  const members = snapshot?.members ?? [];
  const lowStock = snapshot?.lowStock ?? [];

  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hex(color.surface),
        borderRadius: radius.lg,
        paddingLeft: space[4],
        paddingRight: space[4],
        paddingTop: space[3],
        paddingBottom: space[3],
      }}
    >
      {/* Header */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          width: 'match_parent',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <TextWidget
          text={snapshot?.familyName ?? 'Khairiyat'}
          style={{ fontSize: 13, color: hex(color.textSecondary) }}
        />
        <TextWidget
          text={snapshot ? shortTime(snapshot.updatedAt) : ''}
          style={{ fontSize: 11, color: hex(color.textMuted) }}
        />
      </FlexWidget>

      {members.length === 0 ? (
        <TextWidget
          text="Open Khairiyat to see today's doses."
          style={{ fontSize: 14, color: hex(color.textMuted), marginTop: space[2] }}
        />
      ) : (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
          {members.map((member) => (
            <FlexWidget
              key={member.name}
              style={{
                flexDirection: 'row',
                width: 'match_parent',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: space[2],
              }}
            >
              {/* Name, and the count in words so the glyphs are never the
                  only way to read this. */}
              <FlexWidget style={{ flexDirection: 'column' }}>
                <TextWidget
                  text={member.name}
                  style={{ fontSize: 15, color: hex(color.textPrimary) }}
                />
                <TextWidget
                  text={
                    member.needsAttention
                      ? `${member.taken} of ${member.total} · needs a check`
                      : member.taken === member.total
                        ? `all ${member.total} taken`
                        : `${member.taken} of ${member.total} taken`
                  }
                  style={{
                    fontSize: 11,
                    color: hex(
                      member.needsAttention ? color.amber : color.textMuted,
                    ),
                  }}
                />
              </FlexWidget>

              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                {member.states.slice(0, 6).map((state, index) => (
                  <TextWidget
                    key={`${member.name}-${index}`}
                    text={GLYPH[state]}
                    style={{
                      fontSize: 16,
                      color: hex(tone(state)),
                      marginLeft: space[1],
                    }}
                  />
                ))}
              </FlexWidget>
            </FlexWidget>
          ))}
        </FlexWidget>
      )}

      {/* Only ever rendered when stock is genuinely low. */}
      {lowStock.map((item) => (
        <FlexWidget
          key={`${item.memberName}-${item.medicationName}`}
          style={{
            flexDirection: 'row',
            width: 'match_parent',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: space[2],
            backgroundColor: hex(color.redSurface),
            borderRadius: radius.sm,
            paddingLeft: space[2],
            paddingRight: space[2],
            paddingTop: space[1],
            paddingBottom: space[1],
          }}
        >
          <TextWidget
            text={`${item.medicationName} running out`}
            style={{ fontSize: 12, color: hex(color.red) }}
          />
          <TextWidget
            text={item.days === 1 ? '1 day' : `${item.days} days`}
            style={{ fontSize: 13, color: hex(color.red) }}
          />
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}
