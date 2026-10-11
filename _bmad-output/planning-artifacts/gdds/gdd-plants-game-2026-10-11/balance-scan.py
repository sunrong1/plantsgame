"""GDD 数值平衡模拟器（一次性核算工具，非产品代码）。

用途：
1. 测定失败门槛——错几题才会掉满 3 心（epics.md 的验收判据据此书写）
2. 验证「阳光随难度递增」对失败门槛的影响

铁律：本项目所有涉及回合/时序/伤害的推导都必须由本脚本实测得出。
      历史上已因三次手算错误写坏 GDD：
        ① 阳光孤儿机制（支柱 2 形同装饰）
        ② 模拟器自身两个 bug（初始阳光常量、房子判定列号）
        ③ 射程窗口按双向计算，实际僵尸单向经过
      不要凭手算改 GDD，改完重跑这里。

用法：python3 balance-scan.py
"""

COLS, ROUNDS, HEARTS = 9, 10, 3      # 5x9 网格；一局 10 题；3 心
HP, DMG, RANGE, SPD = 100, 50, 3, 2  # 僵尸血 / 直射塔伤害 / 射程格 / 僵尸每回合格
COST, SUN_PER, SUN0 = 50, 50, 0      # 塔造价 / 每次答对阳光 / 开局阳光（0：答对才有第一株塔）


def simulate(wrong_rounds, *, hp=HP, dmg=DMG, rng=RANGE, spd=SPD,
             cost=COST, sun_per=SUN_PER, sun0=SUN0,
             cols=COLS, rounds=ROUNDS, hearts=HEARTS):
    """跑一局，返回掉心数。wrong_rounds 为答错的回合号集合。

    射程为单向：僵尸只从右侧接近塔，攻击窗口按实际经过的格数计。
    """
    sun, hearts_left = sun0, hearts
    towers, zombies = [], {}          # towers: 已建塔所在列；zombies: 列 -> 剩余血量
    for rd in range(1, rounds + 1):
        zombies[cols - 1] = hp                            # 僵尸入场（中间行）
        if rd not in wrong_rounds:
            sun += sun_per                                # 答对奖励
        while sun >= cost and len(towers) < cols - 1:     # 建造
            for c in range(1, cols - 1):
                if c not in towers:
                    towers.append(c)
                    sun -= cost
                    break
            else:
                break
        for t in towers:                                  # 塔攻击射程内最靠近房子的僵尸
            hit = [c for c in zombies if 0 < c - t <= rng]
            if hit:
                c = min(hit)
                zombies[c] -= dmg
                if zombies[c] <= 0:
                    del zombies[c]
        for c in sorted(zombies, reverse=True):           # 僵尸前进
            nxt = c - spd
            if nxt < 1:                                   # 越过第1列 = 抵达房子
                del zombies[c]
                hearts_left -= 1
            else:
                zombies[nxt] = zombies.pop(c)
        if hearts_left <= 0:
            break
    return hearts - hearts_left


def hit_count(tower_col, rng=RANGE, spd=SPD, cols=COLS, hp=HP, dmg=DMG):
    """单塔对单只僵尸的实际命中次数。用于验证『射程窗口』推导。"""
    col, remaining, hits = cols - 1, hp, 0
    while True:
        if 0 < col - tower_col <= rng:
            remaining -= dmg
            hits += 1
        nxt = col - spd
        if nxt < 1:
            break
        col = nxt
    return hits


if __name__ == "__main__":
    print(f"单塔命中校验：塔在第3列射程{RANGE} → 命中 {hit_count(3)} 次 "
          f"= {hit_count(3) * DMG} 伤害 vs {HP} 血 "
          f"（{'恰好击杀' if hit_count(3) * DMG == HP else '非恰好'}）")

    print("\n=== 失败门槛（当前数值，开局 0 阳光）===")
    for n in range(1, 10):
        lost = simulate(set(range(1, n + 1)))
        print(f"  开局连续答错 {n} 题 → 掉 {lost} 心"
              + ("  ← 失败" if lost >= HEARTS else ""))

    print("\n=== 阳光递增对失败门槛的影响 ===")
    print("  「阳光随难度递增」若只增 SUN_PER 而不增造价，塔产量上升 ⇒ 失败更难。")
    print(f"  {'SUN_PER':>9}{'造价':>6}{'开局连续答错N题 → 掉心数':<28}")
    for sun_per, cost in [(50, 50), (60, 50), (75, 50), (100, 50), (50, 75), (75, 75)]:
        row = "".join(str(simulate(set(range(1, n + 1)), sun_per=sun_per, cost=cost))
                      .rjust(4) for n in range(1, 10))
        print(f"  {sun_per:>9}{cost:>6}   {row}")

    print("\n  对照：若同步提高造价（保持比例 1:1），失败门槛不变——")
    for sun_per in [75, 100]:
        cost = sun_per
        row = "".join(str(simulate(set(range(1, n + 1)), sun_per=sun_per, cost=cost))
                      .rjust(4) for n in range(1, 10))
        print(f"  {sun_per:>9}{cost:>6}   {row}")