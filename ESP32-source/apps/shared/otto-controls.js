export const ottoStableMoveButtons = [
  { label: '同步直行', payload: { type: 'move', direction: 'otto_forward', speed: 40 } },
  { label: '异步直行', payload: { type: 'move', direction: 'otto_async_forward', speed: 40 } },
  { label: '同步后退', payload: { type: 'move', direction: 'otto_backward', speed: 40 } },
  { label: '异步后退', payload: { type: 'move', direction: 'otto_async_backward', speed: 40 } },
  { label: '左转', payload: { type: 'move', direction: 'otto_left', speed: 40 } },
  { label: '左快', payload: { type: 'move', direction: 'otto_left_fast', speed: 40 } },
  { label: '右转', payload: { type: 'move', direction: 'otto_right', speed: 40 } },
  { label: '左修正', payload: { type: 'move', direction: 'otto_shift_left', speed: 40 } },
  { label: '右修正', payload: { type: 'move', direction: 'otto_shift_right', speed: 40 } },
  { label: '停止', payload: { type: 'move', direction: 'otto_stop', speed: 0 } }
];

const ottoStableMovePayloads = Object.fromEntries(
  ottoStableMoveButtons.map((button) => [button.payload.direction, button.payload])
);

export function ottoStableMoveCommand(direction) {
  const payload = ottoStableMovePayloads[direction];
  if (!payload) {
    throw new Error(`未知 Otto 稳定区动作：${direction}`);
  }

  return { ...payload };
}
