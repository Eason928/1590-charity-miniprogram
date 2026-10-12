from PIL import Image, ImageDraw
import os

size = 96
accent = (232, 136, 90)
gray = (180, 180, 180)
bg = (255, 255, 255, 0)

outdir = "/Users/ningmeng/Desktop/公益社小猫小程序/miniprogram/images/tab"
os.makedirs(outdir, exist_ok=True)

def make_icon(name, draw_func):
    for suffix, color in [("", gray), ("_selected", accent)]:
        img = Image.new('RGBA', (size, size), bg)
        d = ImageDraw.Draw(img)
        draw_func(d, color)
        img.save(os.path.join(outdir, f"{name}{suffix}.png"), 'PNG')
        print(f"  {name}{suffix}.png")

# 1. 动态
def chat(d, c):
    d.rounded_rectangle([18, 22, 78, 68], radius=10, fill=None, outline=c, width=4)
    d.polygon([(22, 64), (16, 80), (34, 66)], fill=c)
make_icon("forum", chat)

# 2. 猫猫图鉴
def cat(d, c):
    d.ellipse([18, 24, 78, 78], fill=None, outline=c, width=4)
    d.polygon([(24, 40), (18, 14), (36, 28)], fill=None, outline=c, width=3)
    d.polygon([(72, 40), (78, 14), (60, 28)], fill=None, outline=c, width=3)
    d.ellipse([34, 44, 42, 52], fill=c)
    d.ellipse([54, 44, 62, 52], fill=c)
    d.polygon([(46, 54), (50, 54), (48, 58)], fill=c)
make_icon("index", cat)

# 3. 爱心义卖
def bag(d, c):
    d.rounded_rectangle([20, 32, 76, 78], radius=6, fill=None, outline=c, width=4)
    d.arc([22, 18, 48, 38], 200, 340, fill=c, width=4)
    d.arc([48, 18, 74, 38], 200, 340, fill=c, width=4)
make_icon("sale", bag)

# 4. 我的
def user(d, c):
    d.ellipse([30, 14, 66, 50], fill=None, outline=c, width=4)
    d.arc([14, 40, 82, 96], 0, 180, fill=c, width=4)
make_icon("profile", user)

# 5. 关于我们
def info(d, c):
    d.ellipse([14, 14, 82, 82], fill=None, outline=c, width=4)
    d.line([(48, 36), (48, 66)], fill=c, width=5)
    d.ellipse([44, 24, 52, 32], fill=c)
make_icon("about", info)

print("\n10 icons created successfully")
