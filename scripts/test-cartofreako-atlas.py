#!/usr/bin/env python3
"""Exercise source admission and geographic/legend completeness without map datasets."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("atlas", Path(__file__).with_name("prepare-cartofreako-atlas.py"))
atlas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlas)


class AtlasPacket(unittest.TestCase):
    def test_variants_do_not_conflate_maps_and_legends_or_periods(self):
        first = {"stem": "heat-2025", "scope": "world", "svg": "marine-heatwave/annual/event_days/maps/world/svg/heat-2025.svg"}
        legend = {**first, "svg": first["svg"].replace("maps/", "legends/").replace("heat-2025.svg", "heat-2025-legend.svg")}
        matched = {**first, "svg": first["svg"].replace("annual/", "matched/")}
        self.assertEqual(atlas.topic_identity("climate", first), atlas.topic_identity("climate", legend))
        self.assertNotEqual(atlas.topic_identity("climate", first), atlas.topic_identity("climate", matched))

    def test_world_only_variants_keep_both_sheets_without_inventing_japan(self):
        sheets = [{"stem": "heat", "scope": "world", "kind": kind} for kind in ("map", "legend")]
        self.assertEqual(len(atlas.validate_sheets(sheets)), 1)
        with self.assertRaisesRegex(ValueError, "Missing map/legend"):
            atlas.validate_sheets(sheets[:1])
        with self.assertRaisesRegex(ValueError, "Duplicate sheet"):
            atlas.validate_sheets(sheets + sheets[:1])
        with self.assertRaisesRegex(ValueError, "Unsupported review scope"):
            atlas.validate_sheets([{**sheets[0], "scope": "india"}])

    def test_changed_receipt_bytes_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "receipt.json"
            path.write_text(json.dumps({"status": "passed"}))
            expected = atlas.digest(path)
            path.write_text(json.dumps({"status": "failed"}))
            with self.assertRaisesRegex(ValueError, "Source hash differs"):
                atlas.verified_json(path, expected)

    def test_source_paths_cannot_escape_the_validated_delivery(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            for path in ("../secret", "/etc/passwd"):
                with self.assertRaisesRegex(ValueError, "Unsafe source path"):
                    atlas.checked_path(root, path)


if __name__ == "__main__":
    unittest.main()
