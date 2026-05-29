#!/usr/bin/env python3
"""Generate a simple favicon for Pi Agent xY"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_favicon():
    size = 64
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw rounded rectangle background
    padding = 4
    draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=12,
        fill=(59, 130, 246)  # Blue
    )
    
    # Draw "xY" text
    try:
        font = ImageFont.truetype("arial.ttf", 28)
    except:
        font = ImageFont.load_default()
    
    text = "xY"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - 2
    draw.text((x, y), text, fill='white', font=font)
    
    # Save as ICO with multiple sizes
    img.save('D:/Pi-Web/pi-web-src/public/favicon.ico', format='ICO', sizes=[(32, 32), (16, 16)])
    print("favicon.ico created!")

if __name__ == "__main__":
    create_favicon()
