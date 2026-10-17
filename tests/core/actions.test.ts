/**
 * Action 构造器的字面量一致性（Story 1.5 / AC-1、AC-2；子任务 7.4）。
 *
 * ── 守什么 ────────────────────────────────────────────────────────────────
 * 架构 `:714` 把「`Action` 的 `type` 字面量不漂移」划给本模块：`Action` 是
 * 字符串字面量联合，字面量写错一处不会编译报错（联合里有别的成员时，
 * 写 `'END_BULID'` 只是**多出**一个不属于任何分支的值），而是静默让某个
 * 转换分支永远走不到 —— 回合状态机从此少一条边，而测试**全绿**。
 *
 * 判别式辅助函数 `actionName()` 是回合日志 `[core] turn N action=<T>` 的取值处
 * （架构 `:620-628`）。它漏一个分支的后果是对局日志里某类动作打出 `unknown`，
 * 而日志正是排查平衡问题的第一手材料。
 *
 * ── 为什么这么写 ──────────────────────────────────────────────────────────
 * 本文件用**读回**的方式断言（构造 → 读字段），而不是快照 `toEqual`：
 * 快照匹配会在构造器多加一个无害字段时整片变红，而读回断言的是**契约本身**
 * —— 判别式字面量必须原样、载荷必须原样。唯一用 `toEqual` 的是「不得有多余
 * 字段」那一条，因为那正是字面量漂移最隐蔽的形态（多带一个 id 字段）。
 */

import { describe, expect, it } from 'vitest'

import {
  answer,
  actionName,
  continueRound,
  endBuild,
  placeTower,
  resolveRound,
  restartLevel,
  skipQuestion,
} from '../../src/core'
import type { Action } from '../../src/core'

describe('AC-2 —— Action 构造器保证 type 字面量不漂移', () => {
  it('构造器各自产出约定的 type 字面量', () => {
    // 少一条或漂一个字面量，reducer 的阶段转换表就会静少一条边而测试仍全绿。
    // ⚠️📎 下面两条的**条数**是硬编码的联合大小（1.18 起是 **7**）：
    //   新增 action 时它们会红，而那正是要的效果 —— 联合长了一个成员，
    //   「两两不同」那条的期望数必须同步改，否则它会拿 7 个名字去比 6。
    const cases: readonly { readonly actual: Action; readonly expected: Action['type'] }[] = [
      { actual: answer('u1-word-01-o1'), expected: 'ANSWER' },
      { actual: placeTower('u1-word-01', '2,4'), expected: 'PLACE_TOWER' },
      { actual: endBuild(), expected: 'END_BUILD' },
      { actual: resolveRound(), expected: 'RESOLVE_ROUND' },
      { actual: continueRound(), expected: 'CONTINUE' },
      { actual: restartLevel(), expected: 'RESTART_LEVEL' },
      // 📎 Story 1.18 / AC-E4（裁决 11）。
      { actual: skipQuestion('u1-word-01', 'u1-word-01-o1'), expected: 'SKIP_QUESTION' },
    ]
    for (const { actual, expected } of cases) {
      expect(
        actual.type,
        `构造器产出的 type 必须是 ${expected} —— 漂移会让 reducer 的阶段转换表静默少一条边，测试仍全绿`,
      ).toBe(expected)
    }
  })

  it('构造器的 type 字面量两两不同（联合的七个分支互不覆盖）', () => {
    // 两个构造器共用一个字面量会让其中一条转换永远走不到 —— 那正是本文件要抓的形态。
    const names = [
      answer('x'),
      placeTower('x', '2,4'),
      endBuild(),
      resolveRound(),
      continueRound(),
      restartLevel(),
      skipQuestion('x', 'x-o1'),
    ].map((a) => a.type)
    expect(new Set(names).size, `构造器必须产出七个不同的 type，收到 ${names.join('、')}`).toBe(7)
  })

  it('ANSWER 原样携带 optionId', () => {
    // 载荷被吞掉会让「答对」与「答错」不可区分：isCorrect 拿到 undefined，
    // 找不到选项就走到抛错分支，答题流程当场断掉。
    expect(answer('u1-word-03-o2').optionId, 'ANSWER 必须原样携带 optionId，否则答题判定拿到 undefined').toBe(
      'u1-word-03-o2',
    )
  })

  it('PLACE_TOWER 原样携带 entryId 与 cell，且 cell 是格子键字符串', () => {
    // entryId 决定塔的 wordId 与塔型（FR23）；cell 是 cellKey(row,col) 字符串（架构 `:579`）。
    const a = placeTower('u1-word-02', '2,4')
    expect(a.entryId, 'PLACE_TOWER 的 entryId 决定塔绑定的词与塔型，被吞则塔无从归属').toBe('u1-word-02')
    expect(a.cell, 'PLACE_TOWER 的 cell 必须是 cellKey(row,col) 字符串，组件按格子键索引战场').toBe('2,4')
  })

  it('无载荷的三个构造器不产出任何多余字段', () => {
    // 多余字段是字面量漂移最隐蔽的形态：它让 `Object.keys` 的快照变红，
    // 但读回断言看不见 —— 所以这一条必须用全等快照。
    const noPayload = [endBuild(), resolveRound(), continueRound()] as const
    for (const a of noPayload) {
      expect(
        Object.keys(a).sort(),
        `${a.type} 不应携带任何载荷字段 —— 多余字段会让状态机分支行为与契约不符`,
      ).toEqual(['type'])
    }
  })

  it('RESTART_LEVEL 不产出任何多余字段', () => {
    // 重打必须完全由 reduce 依据 deck 重算（题单复用、hearts/sun 重置）；
    // 构造器若带上任何「旧值」载荷，就会出现第二个可写的重置来源。
    expect(Object.keys(restartLevel()).sort(), 'RESTART_LEVEL 不应携带载荷 —— 重置值一律由 reduce 从 deck 重算').toEqual([
      'type',
    ])
  })

  it('构造器返回的是新对象，且不与调用方共享可变状态（纯函数，无副作用）', () => {
    // reducer 是纯函数（决策 2），构造器是 reducer 的输入来源。
    // 「同一串 Action 重放出同一局」要求每个 Action 都是**值**。
    //
    // ⚠️ 这条此前传的是 `string` 原始值（`[CR]` 2026-10-14）：`before` 只是绑定的
    //   副本，没有任何 `answer()` 实现能让断言变红 —— 它守的东西是零。
    //   而且 `OptionId` 是 `string` 的别名，**就地修改在类型上就不可能**，
    //   所以「不修改入参」这条性质没有可观测的失败路径。
    //   真正会咬人的是**返回值是否共享状态**：两次调用若返回同一引用，
    //   组件改一次就会污染后面所有 action，而所有类型检查都拦不住。
    const optionId = 'u1-word-01-o1'
    const first = answer(optionId)
    const second = answer(optionId)

    expect(first, '同一入参必须产出内容相等的两个 action —— 「同一串 Action 重放出同一局」的前提').toEqual(second)
    expect(first, '两次调用必须返回**不同的对象** —— 返回同一引用时，组件改一次就会污染后面所有 action').not.toBe(second)

    // 就地改第一个，第二个必须不受影响。
    ;(first as { type: string }).type = 'TAMPERED'
    expect(
      answer(optionId).type,
      '就地改一个已返回的 action 不得影响后续调用 —— 返回值必须是调用方独占的',
    ).toBe('ANSWER')
  })
})

describe('AC-15 —— actionName 覆盖全部 type（回合日志 action=<T> 的取值处）', () => {
  it('六种 type 都能取到非空名字', () => {
    // 漏一个分支 ⇒ 对局日志打出 `unknown`，而日志是排查门槛问题的第一手材料。
    const samples: readonly Action[] = [
      answer('x'),
      placeTower('x', '2,4'),
      endBuild(),
      resolveRound(),
      continueRound(),
      restartLevel(),
    ]
    for (const a of samples) {
      const name = actionName(a)
      expect(name.length > 0, `actionName 必须给 ${a.type} 一个非空名字，日志里出现 unknown 等于该类动作从日志消失`).toBe(true)
    }
  })

  it('名字与 type 字面量逐一对应（打错字就是日志失真）', () => {
    const expected: readonly [Action['type'], string][] = [
      ['ANSWER', 'ANSWER'],
      ['PLACE_TOWER', 'PLACE_TOWER'],
      ['END_BUILD', 'END_BUILD'],
      ['RESOLVE_ROUND', 'RESOLVE_ROUND'],
      ['CONTINUE', 'CONTINUE'],
      ['RESTART_LEVEL', 'RESTART_LEVEL'],
      // 📎 Story 1.18 / AC-E4。跳过也要进对局日志：真机上「为什么这道题没被考」
      //   是最难自查的一类问题，而回合日志是唯一的线索来源。
      ['SKIP_QUESTION', 'SKIP_QUESTION'],
    ]
    for (const [type, want] of expected) {
      const sample = {
        ANSWER: answer('x'),
        PLACE_TOWER: placeTower('x', '2,4'),
        END_BUILD: endBuild(),
        RESOLVE_ROUND: resolveRound(),
        CONTINUE: continueRound(),
        RESTART_LEVEL: restartLevel(),
        SKIP_QUESTION: skipQuestion('u1-word-0', 'u1-word-0-o1'),
      }[type] as Action
      expect(actionName(sample), `${type} 的日志名必须逐字一致 —— 名字与字面量不一致等于对局日志不可对照`).toBe(want)
    }
  })

  it('unknown type 抛错而非返回 unknown（运行期脏数据必须响）', () => {
    // 存档 / 调试回放可能送来联合之外的值。静默返回 'unknown' 会让日志里
    // 出现一条无法归因的记录，而这恰恰是排查时最需要看清的那一条。
    const dirty = { type: 'END_BULID' } as unknown as Action
    expect(
      () => actionName(dirty),
      '联合外的 type 必须抛错 —— 静默返回 unknown 会让对局日志出现无法归因的记录',
    ).toThrow()
  })
})
