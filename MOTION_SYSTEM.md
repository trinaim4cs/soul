# SOUL: Motion System

Tokens are in `src/theme/motion.ts`. The values follow the `expo-animation` skill tables for Reanimated 4.5.1. Motion quality takes inspiration from how the X Android app moves (continuity, interruption, velocity), never from its UI.

## Principles

1. **Continuity.** When a finger lets go, a spring carries the release `velocity` forward. Nothing restarts or snaps.
2. **Interruptible.** Every gesture-driven animation can be grabbed and reversed mid-flight (shared values, not timelines).
3. **Damped.** Default springs have `dampingRatio: 1`. Slight give (0.8) only after a momentum gesture: a flicked card or a thrown sheet.
4. **Strong ease-out, never ease-in.** Entrances and exits use `Easing.bezier(0.23, 1, 0.32, 1)`.
5. **Short travel.** Transitions move 8 to 16 dp with a fade. There are no full-screen slides and **tabs never slide**.
6. **UI thread only.** Reanimated worklets and CSS transitions. No `setState` per frame, no `PanResponder`, no core `Animated`. Use `.get()` / `.set()`, and `scheduleOnRN` only at the end of a gesture.
7. **Reduced motion.** Honour the Android setting. Keep opacity and state changes; drop translation, scale and overshoot. Gestures still track the finger.
8. **Frequency gate.** Things touched 100+ times a day (tabs, keyboard, scroll) get no custom animation. Press feedback stays near-imperceptible. The rare moments (match reveal) spend the delight budget.

## Tokens

| Token | Value | Use |
|---|---|---|
| `durations.press` | 120 ms | press feedback |
| `durations.small` | 180 ms | toggles, chips, image fade-in |
| `durations.base` | 240 ms | element enters and exits, typing indicator, toast |
| `durations.reveal` | 360 ms | match reveal (rare) |
| `easings.out` | bezier(0.23, 1, 0.32, 1) | default |
| `easings.inOut` | bezier(0.77, 0, 0.175, 1) | on-screen movement |
| `easings.sheet` | bezier(0.32, 0.72, 0, 1) | sheets |
| `springs.settle` | 400 ms, damping ratio 1 | default settle |
| `springs.release` | 400 ms, 0.8 + gesture velocity | swipe card release and snap back |
| `springs.sheet` | 300 ms, 0.8 + velocity | sheets, floating composer |
| `springs.clamped` | 300 ms, 1, overshoot clamped | must not pass an edge |
| `springs.compass` | 700 ms, 1 | Instant compass bearing interpolation |
| `pressFeedback.scale` | 0.97 | buttons |

## Implemented (Phase 2)

- **Press feedback** (`PressableScale`): a Reanimated CSS transition on `transform`, 120 ms, strong ease-out, feedback on press-in. Full-width rows highlight instead of scaling.
- **Skeleton pulse** (`Skeleton`): a CSS keyframe opacity loop of 1.4 s, static under reduced motion.

## Planned, by phase

| Interaction | Phase | Approach |
|---|---|---|
| Swipe card | 7 | `Gesture.Pan` → shared translate/rotate. Release: distance **or** velocity decides; `springs.release` with velocity; rubber-band at the edges; one light haptic when the decision threshold is crossed |
| Filter and safety sheets | 7, 14 | `@expo/ui` BottomSheet or Router `formSheet` (native), else `springs.sheet` |
| Match reveal | 9 | a 360 ms fade and 0.96→1 scale of the black moment, then staggered text; no confetti |
| Floating chat composer | 10 | `react-native-keyboard-controller` keyboard position on the UI thread; composer height changes via layout transition |
| Typing indicator | 10 | three dots, staggered opacity CSS animation, `durations.base` |
| New message entry | 10 | the list container animates, never row `entering` inside virtualized cells |
| Instant compass | 11 | heading and bearing into a shared value; shortest-angle unwrap; `springs.compass`; the arrow is hidden below 100 m |
| Distance changes | 11 | cross-fade of bucketed text only (no counting animation) |

Feel is judged on a **release build** on the slowest available Android device. Dev builds are not a performance environment.
