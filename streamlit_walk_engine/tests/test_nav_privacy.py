"""nav_privacy.py 개인정보 기본값·저장소 스크립트 검증."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from nav_privacy import (
    LS_KEY_ACTIVE,
    LS_KEY_DIAG,
    LS_KEY_LASTFIX,
    PERSONAL_STORAGE_KEYS,
    PrivacySettings,
    personal_storage_remove_script,
    storage_remove_script,
    storage_set_script,
)


def test_privacy_defaults_are_opt_in():
    settings = PrivacySettings()
    assert settings.location_storage is False
    assert settings.diag_consent is False
    assert settings.diag_enabled is False
    assert settings.diag_persist is False
    assert settings.diag_include_coarse_location is False


def test_diag_flags_cannot_bypass_consent_or_enabled_state():
    without_consent = PrivacySettings.from_mapping({
        "diag_consent": False,
        "diag_enabled": True,
        "diag_persist": True,
        "diag_include_coarse_location": True,
    })
    assert without_consent.diag_enabled is False
    assert without_consent.diag_persist is False
    assert without_consent.diag_include_coarse_location is False

    disabled = PrivacySettings.from_mapping({
        "diag_consent": True,
        "diag_enabled": False,
        "diag_persist": True,
    })
    assert disabled.diag_consent is True
    assert disabled.diag_persist is False


def test_json_roundtrip_and_retention_bound():
    settings = PrivacySettings.from_mapping({
        "location_storage": True,
        "diag_consent": True,
        "diag_enabled": True,
        "diag_retention_hours": 999,
    })
    restored = PrivacySettings.from_json(settings.to_json())
    assert restored == settings
    assert restored.diag_retention_hours == 168
    assert json.loads(settings.to_json())["location_storage"] is True


def test_storage_scripts_quote_values_and_target_only_requested_keys():
    set_script = storage_set_script("walk'key", 'value"</script>')
    assert "localStorage.setItem" in set_script
    assert json.dumps("walk'key") in set_script
    assert json.dumps('value"</script>') in set_script

    remove_script = storage_remove_script((LS_KEY_LASTFIX, LS_KEY_DIAG))
    assert LS_KEY_LASTFIX in remove_script
    assert LS_KEY_DIAG in remove_script
    assert LS_KEY_ACTIVE not in remove_script


def test_delete_all_personal_data_covers_every_declared_key():
    script = personal_storage_remove_script()
    assert PERSONAL_STORAGE_KEYS
    assert all(key in script for key in PERSONAL_STORAGE_KEYS)
