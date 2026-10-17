/**
 * `SKIP_QUESTION` 的边界（Story 1.18 / AC-E4、裁决 11）。
 *
 * ── 🔥 这条 action 为什么必须住在 `core/` 而不是组件里 ──────────────────────
 * 「正确项那张图 404 了 ⇒ 这道题答不了」是一个**回合事实**：
 * 它决定题目单推进、心数、进度、可通关性。全仓库**只有一个**地方能算这件事 ——
 * `reducer.ts`（架构硬约束 2：组件只 dispatch、只读 state）。
 *
 * ⚠️ 若让组件「直接把 question 换成下一道」，就会出现**第二个**题单推进事实源：
 *   ① `CONTINUE` 里 `nextQuestion()` 推一道；
 *   ② 组件自己再推一道。
 *   两处迟早分叉，而分叉的症状是「某道题跳过去了但 `turn` 没动」
 *   —— 界面上只表现为战场节奏对不上，没有任何报错指向原因。
 *
 * ── 判据的三条方向（裁决 11 逐字）─────────────────────────────────────────
 *   ① `masteredEntryIds` **不得增长** —— 跳过的词孩子没学会，
 *      记成「已答对」等于把没学的词算成学会了，而进度条会显示一个假的 21/60。
 *   ② **不得丢心** —— 少一张图不是孩子答错。不丢心是「这题不算」而不是「这题算错」。
 *   ③ **题单被清空时不得触发** —— 全都答不出来时跳过会让 `nextQuestion` 返回 `null`，
 *      而后面接的是 `level-complete`，那是在告诉孩子「你学完了」——
 *      一个字都没答却通关，是本项目能造出的最糟的假陈述。
 *
 * ⚠️ **为什么 skipped 要单独一个字段而不是塞进 `masteredEntryIds`**：
 *   见文件末「为什么不是 mastered」的长注释 —— 判据 ① 与它直接冲突。
 */

import { describe, expect, it } from 'vitest'

import {
  actionName,
  answer,
  assertInvariants,
  continueRound,
  createInitialState,
  endBuild,
  isCorrect,
  nextQuestion,
  reduce,
  resolveRound,
  restartLevel,
  skipQuestion,
} from '../../src/core'
import type { Action, DeckEntry, State } from '../../src/core'
import { greedyBuildActions } from '../fixtures/level-driver'

/**
 * 造一份题单：每条一道题，正确项固定是第二个选项（`-b`）。
 *
 * ⚠️ 正确性住在**选项自己**的 `correct: boolean` 上，不在卡上（`types.ts` 的 `isCorrect`）。
 *   本文件早先写成「卡上一个 `correct: 'wN-b'`」，于是 `isCorrect(card, id)` 去找
 *   `option.correct` 拿到 `undefined` —— 对照断言报出 `expected undefined to be true`。
 *   这条注释留着，因为那个形状看起来非常像真的（`Card` 上确实有别的字段是 id 形态），
 *   而症状是**测试自己**在抱怨 fixture 而不是抱怨实现。
 */
function makeDeck(count: number): readonly DeckEntry[] {
  const deck: DeckEntry[] = []
  for (let i = 0; i < count; i += 1) {
    deck.push({
      entryId: `u1-word-${i}`,
      wordId: `u1-word-${i}`,
      // ⚠️ 合法值只有 direct / slow / aoe（`balance.ts` 的 `TOWER_TYPES`）。
      //   本文件最初写的是 `'shooter'`（想当然的塔名），于是只有**跑完整回合链**的那条
      //   会红，报错来自 `costOf` 而非本 story 的判据 —— 改 fixture 时别把这个当实现 bug。
      towerType: 'direct',
      card: {
        kind: 'keyword',
        promptText: `第 ${i} 题`,
        options: [
          { id: `w${i}-a`, text: 'alpha', correct: false },
          { id: `w${i}-b`, text: 'bravo', correct: true },
        ],
      },
    })
  }
  return deck
}

/** 当前题的正确答案 id。⚠️ 不写死字面量 —— 题单形状变了这条会先红。 */
function correctId(question: DeckEntry): string {
  const correct = question.card.options.find((option) => option.correct)
  if (correct === undefined) {
    throw new Error('测试写错了：这道题没有正确项，对照 / 判据全部失效')
  }
  return correct.id
}

/**
 * 「跳过当前这道题（因为它的正确项那张图坏了）」的合法载荷。
 *
 * ⚠️ **`optionId` 是必填**（1.18 `[DS]` 补，见 `types.ts` 的 `SkipQuestionAction`）：
 *   组件不许读 `option.correct`，所以「破的是不是正确项」只能靠载荷告诉 core。
 *   reducer 会用 `isCorrect` 核对 —— 载荷里少这一项，那些「越界的跳过必须被拒绝」
 *   的判据就全都测不到真正要防的那个错法。
 */
function skipCurrent(state: State): Action {
  const question = currentQuestion(state)
  return skipQuestion(question.entryId, correctId(question))
}

/** 建一个 n 题的开局 state。 */
function stateWith(count: number): State {
  return createInitialState({ unitNumber: 1, deck: makeDeck(count) })
}

/** 当前题；只在 `awaiting-answer` 下调用。 */
function currentQuestion(state: State): DeckEntry {
  if (state.phase.kind !== 'awaiting-answer') {
    throw new Error(`测试写错了：当前相位是 ${state.phase.kind}，取不到当前题`)
  }
  return state.phase.question
}

// ── G141 —— action 的形态与字面量唯一性 ───────────────────────────────────

describe('G141 —— SKIP_QUESTION 的形态（Story 1.18 / AC-E4）', () => {
  it('构造器产出规范形态，且 actionName 有对应分支', () => {
    expect(skipQuestion('u1-word-0', 'w0-b')).toEqual({
      type: 'SKIP_QUESTION',
      entryId: 'u1-word-0',
      optionId: 'w0-b',
    })
    expect(
      actionName(skipQuestion('u1-word-0', 'w0-b')),
      // ⚠️ 不是 toBe('SKIP_QUESTION') 就行 —— 拼错字面量时 `actionName` 会走
      //   `assertNeverAction` **抛错**，所以这条能顺带证明 switch 跟上了联合。
      '回合日志里这条动作没有名字 —— 排查「为什么跳过了一道题」时最需要看清的就是它',
    ).toBe('SKIP_QUESTION')
  })

  it('载荷必须带 entryId，且**不是可选** —— 不知道跳的是哪一道就无从核对', () => {
    // 🔥 载荷不是可有可无的：reducer 用它与「当前题」比对。
    //   不带载荷的话，界面可以把「跳 A」发成「跳 B」而 core 无从发现 ——
    //   而那种错会让一道**好着的**题凭空消失。
    const action = skipQuestion('u1-word-0', 'w0-b') as { readonly entryId?: unknown }
    expect(typeof action.entryId, 'SKIP_QUESTION 没带 entryId ⇒ reducer 无从核对是哪一道题').toBe('string')
  })

  it('载荷必须带 optionId —— 组件不许读 `option.correct`，只能靠载荷告诉 core', () => {
    // 🔥 这一条是 1.18 `[DS]` 补的，理由逐字在 `types.ts`：
    //   裁决 11 的原文写「`OptionCard` 在正确项 `failed` 时 dispatch 一个 `SKIP_QUESTION`」，
    //   但组件**没有资格**知道哪个是正确项（守卫 `quiz-card.test.ts` 禁 `.correct`）。
    //   ⇒ 唯一诚实的通路是「载荷带 optionId，reducer 用 `isCorrect` 核对」。
    //   若载荷里没有它，「干扰项破图也跳整题」这个误用就无人可拦。
    const action = skipQuestion('u1-word-0', 'w0-b') as { readonly optionId?: unknown }
    expect(
      typeof action.optionId,
      'SKIP_QUESTION 没带 optionId ⇒ 「破的是不是正确项」这件事只有组件知道，' +
        '而一张干扰项的图 404 就会把整道好题跳掉',
    ).toBe('string')
  })
})

// ── G142 —— 跳过不产生任何「学会 / 答错」的后果 ────────────────────────────

describe('G142 —— 跳过不得增长 mastered / 不得算答对（Story 1.18 / AC-E4、裁决 11①）', () => {
  it('masteredEntryIds 与 unlocked 原样不动', () => {
    const before = stateWith(4)
    const entryId = currentQuestion(before).entryId
    const after = reduce(before, skipCurrent(before))

    expect(
      after.masteredEntryIds,
      `跳过一题却让 masteredEntryIds 增长了（${JSON.stringify(after.masteredEntryIds)}）—— ` +
        '孩子没学会这个词，记成「已答对」会让进度条显示一个假的数字，' +
        '而且那个词从此永远不会再出现',
    ).toEqual(before.masteredEntryIds)
    expect(
      after.unlocked,
      '跳过却解锁了塔卡 —— 解锁的唯一途径是答对，绕过去等于白送',
    ).toEqual(before.unlocked)
    expect(entryId).not.toBe('')
  })

  it('阳光、心数、回合号与战场一个都不动', () => {
    const before = stateWith(4)
    const after = reduce(before, skipCurrent(before))

    expect(after.sun, '跳过给了阳光 —— 孩子没答任何东西').toBe(before.sun)
    expect(after.hearts, '跳过扣了心 —— 少一张图不是孩子答错').toBe(before.hearts)
    expect(after.turn, '跳过推进了回合号 —— 没有发生任何战斗，回合不该动').toBe(before.turn)
    expect(after.zombies, '跳过动了战场 —— 没有结算，僵尸集合原样').toEqual(before.zombies)
    expect(after.towers, '跳过动了战场上的塔').toEqual(before.towers)
  })

  it('对照：真的答对时 mastered **会**增长（证明上一条不是恒真）', () => {
    // 🔥 反向自测：G142 那两条断言若写得太松（「原样不动」被误写成「相等就行」），
    //   就会在「跳过与答对不做区分」时一起绿。这条给出对照。
    const before = stateWith(4)
    const question = currentQuestion(before)
    const chosen = correctId(question)
    expect(isCorrect(question.card, chosen), 'fixture 的正确项不对，跳过 / 答对的对照失效').toBe(true)

    const answered = reduce(before, answer(chosen))
    expect(
      answered.masteredEntryIds,
      '答对却没有增长 masteredEntryIds —— 那说明 mastered 根本不参与记账，' +
        'G142 的两条断言就是恒真的',
    ).toContain(question.entryId)
  })
})

// ── G143 —— 跳过的题不再出现，但也没有被「学会」 ────────────────────────────

describe('G143 —— 跳过的那道题不再被抽中（Story 1.18 / AC-E4）', () => {
  it('跳过后 nextQuestion 返回另一道题', () => {
    const before = stateWith(4)
    const skipped = currentQuestion(before).entryId
    const after = reduce(before, skipCurrent(before))

    expect(
      currentQuestion(after).entryId,
      '跳过之后挂在界面上的还是那道题 —— 没有跳成，孩子会一直面对四个置灰的选项',
    ).not.toBe(skipped)
    expect(
      nextQuestion(after.deck, after.masteredEntryIds, after.skippedEntryIds)?.entryId,
      'nextQuestion 仍然抽得到被跳过的那道题 —— 它不在排除集合里',
    ).not.toBe(skipped)
  })

  it('跳过的题记在 skippedEntryIds 里，且与 mastered 不相交', () => {
    const before = stateWith(4)
    const skipped = currentQuestion(before).entryId
    const after = reduce(before, skipCurrent(before))

    expect(after.skippedEntryIds).toContain(skipped)
    expect(
      after.skippedEntryIds.filter((id) => after.masteredEntryIds.includes(id)),
      '同一个 entryId 既被跳过又被记成已答对 —— 两条路径都声称「它不用再考了」，' +
        '而孩子到底学会没有已经无法判断',
    ).toEqual([])
  })

  it('⚠️ 为什么 skipped 不能塞进 masteredEntryIds：判据 ① 与它直接冲突', () => {
    // 这条不是测代码，是**把裁决 11 ① 的理由钉在测试里**，防后来人「顺手简化」。
    const before = stateWith(4)
    const skipped = currentQuestion(before).entryId
    const after = reduce(before, skipCurrent(before))

    // 若实现改成「往 masteredEntryIds 里塞」，那么第 ① 条就会红 ——
    expect(
      after.masteredEntryIds.includes(skipped),
      '被跳过的题出现在 masteredEntryIds 里 —— 那等于把这个没学的词记成学会了，' +
        '而进度条与「已读 N/60」都会显示一个假的数字',
    ).toBe(false)
    expect(
      after.skippedEntryIds.includes(skipped),
      '跳过的题不在 skippedEntryIds 里 ⇒ 它没有任何持久标记，' +
        '下一回合 `CONTINUE` 时会被重新抽中，死局照旧（而这正是本 AC 要治的那个）',
    ).toBe(true)
  })

  it('🔴 走完一整回合再 CONTINUE：被跳过的那道题不会被重新抽中', () => {
    // 🔥 这条专治 `applyContinue` **漏传第三个参数**那个错法。
    //   上一条断言的是「调用点自己传对了」，而 `CONTINUE` 是另一处调用点 ——
    //   它漏传时上面全绿：跳题当时生效了，可下一回合那道题又回到题面上，
    //   孩子看到的就是「我跳了，它又回来了」。
    //   ⚠️ 必须走**真的**回合链（answer → build → endBuild → resolveRound → continue），
    //   直接调 `nextQuestion` 验不到 reducer 内部那处调用。
    const before = stateWith(4)
    const skipped = currentQuestion(before).entryId
    const afterSkip = reduce(before, skipCurrent(before))

    // 答对当前这道（跳过后换了一道新的），把它推到 awaiting-build。
    const answered = reduce(afterSkip, answer(correctId(currentQuestion(afterSkip))))
    expect(answered.phase.kind, 'fixture 没推到 awaiting-build，这条是空跑').toBe('awaiting-build')

    let cursor: State = answered
    for (const action of greedyBuildActions(cursor)) {
      cursor = reduce(cursor, action)
    }
    cursor = reduce(cursor, endBuild())
    cursor = reduce(cursor, resolveRound())
    expect(cursor.phase.kind, 'fixture 没推到 round-over，这条是空跑').toBe('round-over')

    const advanced = reduce(cursor, continueRound())
    expect(advanced.phase.kind, 'CONTINUE 之后不是 awaiting-answer，这条是空跑').toBe('awaiting-answer')
    expect(
      currentQuestion(advanced).entryId,
      `回合推进之后又把被跳过的那道题抽出来了 —— \`applyContinue\` 漏传了 skippedEntryIds，` +
        '孩子会看到「我明明跳过了，它又回来了」',
    ).not.toBe(skipped)
    expect(
      advanced.skippedEntryIds,
      'CONTINUE 之后跳过记录被清空了 —— 那道题此后再也不会被排除，等于跳了个寂寞',
    ).toContain(skipped)
  })
})

// ── G144 —— 越界的跳过必须被 core 拒绝 ────────────────────────────────────

describe('G144 —— 跳过只在「等答案且确实还有下一题」时合法（Story 1.18 / AC-E4、裁决 11③）', () => {
  it('题单只剩这一道题时跳过被拒绝（否则后面接的是 level-complete —— 没答却通关）', () => {
    // 🔥 这是判据 ③ 的**具体死局**：只剩一题时跳过会让 `nextQuestion` 返回 `null`，
    //   而 `null` 在 `CONTINUE` 里意味着「这一局通关」——
    //   一个字都没答的孩子看到「读完啦！」。
    //
    // ⚠️⚠️ **这条的判据是 [DS] 变异验证 M157 改出来的**（初版只写 `.toThrow()`）。
    //   变异：把 `rejectAction(...)` 换成一条 `console.warn`（照样往下走，
    //   于是返回的 state 里 `phase.question` 是 `null`）。
    //   ⇒ **18 条全绿** —— 因为 `reduce` 末尾的 `assertInvariants` 看到
    //     `question: null` **也会抛错**，而 `.toThrow()` 不挑原因。
    //   ⇒ 那是一条**假绿**：它绿着不是因为「core 拒绝了越界的跳过」，
    //     而是因为「core 造出了一个畸形状态、然后被自己的不变量抓住」。
    //   两者对玩家的后果完全不同：前者是一句人话诊断，后者是一句
    //     `内部错误：awaiting-answer 相位没有题目`，指向完全错误的方向。
    // ⇒ 判据因此钉住**消息本身**：只有 `rejectAction` 那条路径能通过。
    const only = stateWith(1)
    expect(
      () => reduce(only, skipCurrent(only)),
      '只剩一道题时跳过没有被拒绝 —— 那会让这一局走进「全部答对 ⇒ 通关」那一支，' +
        '而孩子一个词都没答',
    ).toThrow(/题单里已经没有别的题可考了/)
  })

  it('⚠️ R-53 配套：上面那条消息判据不会被「不变量抓到的畸形状态」蒙混过去', () => {
    // 这条把「另一种抛法」显式摆出来对照：那才是 M157 变异实际走的路径。
    // 若哪天有人把上面那条的消息判据放宽成 `.toThrow()`，这条会提醒他为什么不该。
    const malformed = new Error('内部错误：awaiting-answer 相位没有题目')
    expect(
      () => {
        throw malformed
      },
      '不变量抓到的畸形状态**不该**满足上面那条消息判据 —— 它满足就说明判据被放宽了',
    ).not.toThrow(/题单里已经没有别的题可考了/)
  })

  it('entryId 与当前题不符时被拒绝（界面把「跳 A」发成「跳 B」时 core 要拦）', () => {
    const before = stateWith(4)
    expect(
      () => reduce(before, skipQuestion('u1-word-3', 'w3-b')),
      'payload 的 entryId 与当前题不符却照跳了 —— 那会让一道好着的题凭空消失，' +
        '而界面与日志里都看不出少了什么',
    ).toThrow()
  })

  it('🔴 optionId 不是正确项时被拒绝（**干扰项**破图时那道题仍然答得了）', () => {
    // 🔥 这是 1.18 `[DS]` 补的判据。场景：四张词图里有一张干扰项 404。
    //   孩子从剩下三项里照样能选对 ⇒ **这道题不该被跳掉**。
    //   若不核对，每一张干扰项的 404 都会白扔掉一道好题 ——
    //   而题单就那么长，扔掉几道之后剩下的题可能也不够通关了。
    const before = stateWith(4)
    const question = currentQuestion(before)
    const wrong = question.card.options.find((option) => option.correct === false)
    expect(wrong, 'fixture 没有干扰项，这条判据是空跑').toBeDefined()

    expect(
      () => reduce(before, skipQuestion(question.entryId, wrong!.id)),
      '干扰项破图也把整题跳掉了 —— 这道题仍然答得了（孩子从剩下的选项里选就行），' +
        '跳过它等于白扔一道好题',
    ).toThrow()
  })

  it('非 awaiting-answer 相位下跳过被拒绝（跳过不改变回合，却绕过了建造与结算）', () => {
    // 先答对一题把相位推到 awaiting-build，再在那个相位上试跳过。
    const before = stateWith(4)
    const answered = reduce(before, answer(correctId(currentQuestion(before))))
    expect(answered.phase.kind, 'fixture 没把相位推到 awaiting-build，G144 这条是空跑').toBe('awaiting-build')

    expect(
      () => reduce(answered, skipQuestion(before.deck[1]!.entryId, 'w1-b')),
      '在 awaiting-build 上跳题没有被拒绝 —— 那会绕过建造与结算，' +
        '战场上的僵尸不结算就换题，`turn` 与战场从此对不上',
    ).toThrow()
  })
})

// ── G145 —— 重打与存档往返 ────────────────────────────────────────────────

describe('G145 —— 重打清空跳过记录（Story 1.18 / AC-E4）', () => {
  it('RESTART_LEVEL 后 skippedEntryIds 清空（重打要重新试那些题）', () => {
    const before = stateWith(4)
    const skippedEntryIds = [currentQuestion(before).entryId]
    // 造一份「已经失败」的对局：先答错耗尽心数（HEARTS 由 core 常量定，这里直接改 hearts 后过不变量）
    const failed: State = {
      ...before,
      hearts: 0,
      skippedEntryIds,
      phase: { kind: 'level-failed' },
    }

    const restarted = reduce(failed, restartLevel())
    expect(
      restarted.skippedEntryIds,
      '重打后还留着跳过记录 —— 那道题的孩子仍然学不到，' +
        '而他明明重新开始了一遍（此时网络可能已经恢复）',
    ).toEqual([])
  })
})

describe('G146 —— 不变量守住 skippedEntryIds（Story 1.18 / AC-E4、R-41）', () => {
  it('skippedEntryIds 含题单之外的 entryId 时 assertInvariants 抛错', () => {
    // ⚠️ 内容回滚 / 存档来自另一个内容版本时，这真的会发生。
    //   若没有这条断言，越界的 id 会一路进 `nextQuestion` 的排除集合 ——
    //   它不匹配任何题单条目 ⇒ **毫无效果**，而孩子面对的仍是一道答不了的题。
    const before = stateWith(4)
    expect(
      () => assertInvariants({ ...before, skippedEntryIds: ['u9-not-in-deck'] }),
      'skippedEntryIds 含题单外的 id 而不变量没报错 —— 它会静默地什么都排除不掉',
    ).toThrow(/skippedEntryIds/)
  })

  it('skipped 与 mastered 相交时 assertInvariants 抛错（同一个词既跳过又学会了）', () => {
    const before = stateWith(4)
    const entryId = currentQuestion(before).entryId
    const answered = reduce(before, answer(correctId(currentQuestion(before))))
    expect(answered.masteredEntryIds).toContain(entryId)

    expect(
      () => assertInvariants({ ...answered, skippedEntryIds: [entryId] }),
      '同一个 entryId 既在 skipped 又在 mastered 里而不报错 —— ' +
        '两条路径各自声称「它不用再考」，这个词到底学会没有已经无法判断',
    ).toThrow(/skippedEntryIds/)
  })

  it('反向自测：本题单外的 id 确实不在 deck 里（证明上面的数据真的越界）', () => {
    expect(stateWith(4).deck.map((entry) => entry.entryId)).not.toContain('u9-not-in-deck')
  })
})
