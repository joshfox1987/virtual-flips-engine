#!/usr/bin/env python3
"""
Deterministic image enhancement pipeline (non-AI):
- optional background cleanup if OpenCV is available
- autocontrast + gentle color/contrast/brightness boost
- unsharp mask for crispness
"""

import sys
from PIL import Image, ImageOps, ImageEnhance, ImageFilter


def optional_background_cleanup(img: Image.Image) -> Image.Image:
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore

        bgr = cv2.cvtColor(np.array(img.convert('RGB')), cv2.COLOR_RGB2BGR)
        mask = np.zeros(bgr.shape[:2], np.uint8)
        bgd = np.zeros((1, 65), np.float64)
        fgd = np.zeros((1, 65), np.float64)

        h, w = bgr.shape[:2]
        rect = (5, 5, max(1, w - 10), max(1, h - 10))
        cv2.grabCut(bgr, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
        fg_mask = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')

        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        rgba = np.dstack((rgb, fg_mask * 255))
        fg = Image.fromarray(rgba, mode='RGBA')

        # Composite over soft white studio background
        bg = Image.new('RGBA', fg.size, (248, 248, 248, 255))
        composed = Image.alpha_composite(bg, fg)
        return composed.convert('RGB')
    except Exception:
        return img.convert('RGB')


def enhance(in_path: str, out_path: str) -> None:
    img = Image.open(in_path)
    img = optional_background_cleanup(img)
    img = ImageOps.autocontrast(img, cutoff=1)

    img = ImageEnhance.Color(img).enhance(1.06)
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Brightness(img).enhance(1.03)

    img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=120, threshold=2))
    img.save(out_path, format='JPEG', quality=95, optimize=True)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print('Usage: image_enhance.py <input_path> <output_path>')
        sys.exit(1)

    enhance(sys.argv[1], sys.argv[2])
