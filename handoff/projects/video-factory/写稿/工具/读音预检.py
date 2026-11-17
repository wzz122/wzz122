# -*- coding: utf-8 -*-
"""配音前的读音预检（不花钱、不加载模型）：扫出多音字、日本地名、助词「地」等风险点，定好读音再配。

用法：
  python3 读音预检.py 文本/ch01-tts.txt 文本/ch02-tts.txt …      # 逐章扫描；有「待定」时退出码 1
  python3 读音预检.py 文本/ch*-tts.txt --入库                     # 把本期读音表里标了「钉+通用 / 钉+看语境」的条目写进永久词典

读音从三处来（前面的优先）：
  1. 本期读音表  配音/读音.tsv（自动往上找；也可 --读音表 指定）  词<Tab>读音<Tab>方式<Tab>备注
  2. 永久词典    ~/Desktop/写稿/工具/读音词典.tsv 里范围是「通用」的条目
  3. 自动        常见词里的多音字（拼音库认识这个词，而且读法不是模型的默认读法）
其余拿不准的列为「待定」：看上下文定读音，把**词组**（不是单字）写进本期读音表，再跑一遍，直到没有待定。
结果写到 配音/读音/chNN.预检.json；api配音.py 配音时会自己再算一遍，有待定不花钱。"""
import argparse, json, sys
from pathlib import Path
import pron_lib as P


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('txt', nargs='+')
    ap.add_argument('--读音表', dest='table')
    ap.add_argument('--入库', dest='promote', action='store_true')
    a = ap.parse_args()
    tpath = a.table or P.find_table(*a.txt)
    table = P.load_table(tpath)
    print(f'本期读音表：{tpath or "没有（需要时新建 配音/读音.tsv）"}，{len(table)} 条；永久词典 {len(P.load_dict())} 条')
    if a.promote:
        new = P.promote(table)
        print('入库：' + ('、'.join(new) if new else '没有新条目（方式写 钉+通用 或 钉+看语境 的才入库）'))
    n_todo = 0
    for f in a.txt:
        f = Path(f)
        text = f.read_text(encoding='utf-8').strip()
        r = P.analyze(text, table)
        out = f.resolve().parent.parent / '读音'
        out.mkdir(exist_ok=True)
        name = f.stem.replace('-tts', '')
        (out / f'{name}.预检.json').write_text(json.dumps(dict(r, text_file=str(f)), ensure_ascii=False, indent=1), encoding='utf-8')
        fixed = [p for p in r['points'] if p['status'] == '已定']
        auto = sorted({p['word'] + P.fmt(p['expect']) for p in r['points'] if p['status'] == '自动'})
        print(f'\n== {f.name}：{len(text)} 字，钉 {len(r["pins"])} 条（词典/本期 {len({p["word"] for p in fixed})}，自动 {len(auto)}），待定 {len(r["todo"])}')
        if auto:
            print('  自动钉：' + ' '.join(auto))
        for w in r['warns']:
            print('  提醒：' + w)
        for p in r['todo']:
            print(f'  待定[{p["kind"]}] {p["ctx"]}  → {p["hint"]}')
        n_todo += len(r['todo'])
    print(f'\n合计待定 {n_todo} 处' + ('：定好读音写进本期读音表再跑' if n_todo else '，可以配音'))
    sys.exit(1 if n_todo else 0)


if __name__ == '__main__':
    main()
