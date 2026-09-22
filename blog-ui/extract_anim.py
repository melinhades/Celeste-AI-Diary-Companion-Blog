import zipfile, re
z = zipfile.ZipFile(r'c:\Users\28464\IdeaProjects\blog\blog-ui\Atlases\WaveDashing\凌波微步.ppt.pptx')
slides = sorted([n for n in z.namelist() if n.startswith('ppt/slides/slide') and n.endswith('.xml')])
print('slides:', slides)
for s in slides:
    print('\n====', s)
    data = z.read(s).decode('utf-8')
    m = re.search(r'<p:timing>.*?</p:timing>', data, re.S)
    if not m:
        print('no timing')
        continue
    timing = m.group(0)
    # 找动画节点类型
    types = re.findall(r'<p:(\w+)(?:\s|>)', timing)
    from collections import Counter
    print('anim node types:', Counter(types).most_common())
    # 找 presetID / presetClass
    presets = re.findall(r'presetID="(\d+)"', timing)
    print('presetIDs:', presets[:30])
    # 找 spid（目标形状）
    spids = re.findall(r'spid="([^"]+)"', timing)
    print('spids:', spids[:30])
