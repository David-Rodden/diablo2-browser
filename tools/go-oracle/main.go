// Reference dumper: decode a Diablo II format file with the community Go
// implementations and print a canonical JSON summary, so this project's
// TypeScript decoders can be diffed against an independent implementation.
//
// Usage: go run main.go <dc6|dt1|ds1> <file>
package main

import (
	"encoding/json"
	"fmt"
	"os"

	dc6pkg "github.com/OpenDiablo2/dc6/pkg"
	pl2pkg "github.com/OpenDiablo2/pl2/pkg"
	ds1pkg "github.com/OpenDiablo2/ds1/pkg"
	dt1pkg "github.com/OpenDiablo2/dt1/pkg"
)

// ints converts a byte slice into a JSON-friendly array (Go would otherwise
// marshal it as base64).
func ints(data []byte) []int {
	out := make([]int, len(data))
	for i, value := range data {
		out[i] = int(value)
	}
	return out
}

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: main <dc6|dt1|ds1> <file>")
		os.Exit(2)
	}
	data, err := os.ReadFile(os.Args[2])
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	var out any
	switch os.Args[1] {
	case "dc6":
		out, err = dumpDc6(data)
	case "dt1":
		out, err = dumpDt1(data)
	case "ds1":
		out, err = dumpDs1(data)
	case "pl2":
		out, err = dumpPl2(data)
	default:
		err = fmt.Errorf("unknown format %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	encoded, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(encoded))
}

// dumpDc6 reports the header plus every frame's geometry and index grid.
func dumpDc6(data []byte) (any, error) {
	sheet, err := dc6pkg.FromBytes(data)
	if err != nil {
		return nil, err
	}
	frames := []any{}
	for _, direction := range sheet.Directions {
		perDirection := []any{}
		for _, frame := range direction.Frames {
			perDirection = append(perDirection, map[string]any{
				"width":   int(frame.Width),
				"height":  int(frame.Height),
				"offsetX": int(frame.OffsetX),
				"offsetY": int(frame.OffsetY),
				"indices": ints(frame.IndexData),
			})
		}
		frames = append(frames, perDirection)
	}
	perDirection := 0
	if len(sheet.Directions) > 0 {
		perDirection = len(sheet.Directions[0].Frames)
	}
	return map[string]any{
		"format":             "dc6",
		"directions":         len(sheet.Directions),
		"framesPerDirection": perDirection,
		"frames":             frames,
	}, nil
}

// dumpDt1 reports every tile's identity fields, sub-tile flags and block pixels.
func dumpDt1(data []byte) (any, error) {
	library, err := dt1pkg.FromBytes(data)
	if err != nil {
		return nil, err
	}
	tiles := []any{}
	for _, tile := range library.Tiles {
		flags := []any{}
		for subY := 0; subY < 5; subY++ {
			for subX := 0; subX < 5; subX++ {
				fileIndex := (4-subY)*5 + subX
				flag := tile.SubTileFlags[fileIndex]
				var raw byte
				if flag.BlockWalk {
					raw |= 1
				}
				if flag.BlockLOS {
					raw |= 2
				}
				if flag.BlockJump {
					raw |= 4
				}
				if flag.BlockPlayerWalk {
					raw |= 8
				}
				if flag.BlockLight {
					raw |= 32
				}
				flags = append(flags, int(raw))
			}
		}
		blocks := []any{}
		for _, block := range tile.Blocks {
			blocks = append(blocks, map[string]any{
				"x":      int(block.X),
				"y":      int(block.Y),
				"gridX":  int(block.GridX),
				"gridY":  int(block.GridY),
				"format": int(block.Format),
				"pixels": ints(block.PixelData),
			})
		}
		material := 0
		if tile.MaterialFlags.Other {
			material |= 0x0001
		}
		if tile.MaterialFlags.Water {
			material |= 0x0002
		}
		if tile.MaterialFlags.WoodObject {
			material |= 0x0004
		}
		if tile.MaterialFlags.InsideStone {
			material |= 0x0008
		}
		if tile.MaterialFlags.OutsideStone {
			material |= 0x0010
		}
		if tile.MaterialFlags.Dirt {
			material |= 0x0020
		}
		if tile.MaterialFlags.Sand {
			material |= 0x0040
		}
		if tile.MaterialFlags.Wood {
			material |= 0x0080
		}
		if tile.MaterialFlags.Lava {
			material |= 0x0100
		}
		if tile.MaterialFlags.Snow {
			material |= 0x0400
		}
		tiles = append(tiles, map[string]any{
			"direction":     int(tile.Direction),
			"height":        int(tile.Height),
			"width":         int(tile.Width),
			"type":          int(tile.Type),
			"style":         int(tile.Style),
			"sequence":      int(tile.Sequence),
			"materialFlags": material,
			"subTileFlags":  flags,
			"blocks":        blocks,
		})
	}
	return map[string]any{"format": "dt1", "tiles": tiles}, nil
}

// dumpDs1 reports the map header, every cell's layers and the object list.
func dumpDs1(data []byte) (any, error) {
	level, err := ds1pkg.FromBytes(data)
	if err != nil {
		return nil, err
	}
	rows := []any{}
	for y := 0; y < int(level.Height); y++ {
		row := []any{}
		for x := 0; x < int(level.Width); x++ {
			cell := level.Tiles[y][x]
			walls := []any{}
			for _, wall := range cell.Walls {
				walls = append(walls, map[string]any{
					"prop1":    int(wall.Prop1),
					"sequence": int(wall.Sequence),
					"style":    int(wall.Style),
					"type":     int(wall.Type),
					"unknown1": int(wall.Unknown1),
					"unknown2": int(wall.Unknown2),
					"hidden":   wall.Hidden,
				})
			}
			floors := []any{}
			for _, floor := range cell.Floors {
				floors = append(floors, map[string]any{
					"prop1":    int(floor.Prop1),
					"sequence": int(floor.Sequence),
					"style":    int(floor.Style),
					"unknown1": int(floor.Unknown1),
					"unknown2": int(floor.Unknown2),
					"hidden":   floor.Hidden,
				})
			}
			shadows := []any{}
			for _, shadow := range cell.Shadows {
				shadows = append(shadows, map[string]any{
					"prop1":    int(shadow.Prop1),
					"sequence": int(shadow.Sequence),
					"style":    int(shadow.Style),
					"unknown1": int(shadow.Unknown1),
					"unknown2": int(shadow.Unknown2),
					"hidden":   shadow.Hidden,
				})
			}
			row = append(row, map[string]any{"walls": walls, "floors": floors, "shadows": shadows})
		}
		rows = append(rows, row)
	}
	objects := []any{}
	for _, object := range level.Objects {
		objects = append(objects, map[string]any{
			"type": int(object.Type), "id": int(object.ID),
			"x": int(object.X), "y": int(object.Y), "flags": int(object.Flags),
		})
	}
	return map[string]any{
		"format":      "ds1",
		"version":     int(level.Version),
		"width":       int(level.Width),
		"height":      int(level.Height),
		"act":         int(level.Act),
		"wallLayers":  int(level.NumberOfWalls),
		"floorLayers": int(level.NumberOfFloors),
		"cells":       rows,
		"objects":     objects,
	}, nil
}

// fnv1a is a small digest so whole tables can be compared without shipping
// 442 KB of numbers through JSON.
func fnv1a(data []byte) uint32 {
	var hash uint32 = 2166136261
	for _, b := range data {
		hash ^= uint32(b)
		hash *= 16777619
	}
	return hash
}

func digestTables(tables [][]byte) []uint32 {
	for _, table := range tables {
		_ = table
	}
	out := make([]uint32, 0, len(tables))
	for _, table := range tables {
		out = append(out, fnv1a(table))
	}
	return out
}

// dumpPl2 reports the base palette, the text palette and a per-group digest of
// every transform table, so a layout disagreement shows up as a digest mismatch.
func dumpPl2(data []byte) (any, error) {
	palette, err := pl2pkg.FromBytes(data)
	if err != nil {
		return nil, err
	}
	base := []int{}
	for _, c := range palette.BasePalette {
		r, g, b, _ := c.RGBA()
		base = append(base, int(uint8(r)), int(uint8(g)), int(uint8(b)))
	}
	text := []int{}
	for _, c := range palette.TextColors {
		r, g, b, _ := c.RGBA()
		text = append(text, int(uint8(r)), int(uint8(g)), int(uint8(b)))
	}
	asBytes := func(tables []pl2pkg.Transform) [][]byte {
		out := make([][]byte, 0, len(tables))
		for i := range tables {
			out = append(out, tables[i][:])
		}
		return out
	}
	alpha := [][]byte{}
	for i := range palette.AlphaBlend {
		alpha = append(alpha, asBytes(palette.AlphaBlend[i])...)
	}
	return map[string]any{
		"format": "pl2",
		"size":   len(data),
		"base":   base,
		"text":   text,
		"groups": map[string]any{
			"lightLevels":        digestTables(asBytes(palette.LightLevelVariations)),
			"inverseColors":      digestTables(asBytes(palette.InvColorVariations)),
			"selectedUnitShift":  digestTables(asBytes([]pl2pkg.Transform{palette.SelectedUnitShift})),
			"alphaBlend":         digestTables(alpha),
			"additiveBlend":      digestTables(asBytes(palette.AdditiveBlend)),
			"multiplyBlend":      digestTables(asBytes(palette.MultiplicativeBlend)),
			"hueVariations":      digestTables(asBytes(palette.HueVariations)),
			"redTones":           digestTables(asBytes([]pl2pkg.Transform{palette.RedTones})),
			"greenTones":         digestTables(asBytes([]pl2pkg.Transform{palette.GreenTones})),
			"blueTones":          digestTables(asBytes([]pl2pkg.Transform{palette.BlueTones})),
			"unknownVariations":  digestTables(asBytes(palette.UnknownVariations)),
			"maxComponentBlend":  digestTables(asBytes(palette.MaxComponentBlend)),
			"darkenedShift":      digestTables(asBytes([]pl2pkg.Transform{palette.DarkenedColorShift})),
			"textShifts":         digestTables(asBytes(palette.TextColorShifts)),
		},
	}, nil
}
