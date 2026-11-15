"""machines.py - which part GLB sits at which socket, per machine (the INTENDED build of the blueprints)."""
S = "public/assets/models/shared/"
WELL = [
    ("SOCKET_BearingTop", S + "structural/bearing_pillow_block.glb"),
    ("SOCKET_GearDrive", S + "spur_gear/gear_spur_20_m1.glb"),
    ("SOCKET_Spring", S + "spring/spring_standard.glb"),
    ("SOCKET_Key", S + "winding_key/winding_key.glb"),
    ("SOCKET_GearCam", S + "spur_gear/gear_spur_10_m1.glb"),
    ("SOCKET_Cam", S + "cam/cam_eccentric.glb"),
    ("SOCKET_Follower", S + "follower/follower_roller.glb"),
    ("SOCKET_Ratchet", S + "ratchet/ratchet_wheel.glb"),
    ("SOCKET_Pawl", S + "pawl/pawl_standard.glb"),
    ("SOCKET_PulleyDrive", S + "pulley/pulley_standard.glb"),
    ("SOCKET_PulleyIdle", S + "pulley/pulley_standard.glb"),
    ("SOCKET_BaseHandle", S + "interaction/machine_base_handle.glb"),
]
BELFRY = [
    ("SOCKET_GearPinion", S + "spur_gear/gear_spur_12_m1.glb"),
    ("SOCKET_Spring", S + "spring/spring_standard.glb"),
    ("SOCKET_Key", S + "winding_key/winding_key.glb"),
    ("SOCKET_GearDrive", S + "spur_gear/gear_spur_20_m1.glb"),
    ("SOCKET_BevelB", S + "bevel_gear/gear_bevel_12.glb"),
    ("SOCKET_BevelA", S + "bevel_gear/gear_bevel_12.glb"),
    ("SOCKET_BearingFoot", S + "structural/bearing_pillow_block.glb"),
    ("SOCKET_Flywheel", S + "flywheel/flywheel_standard.glb"),
    ("SOCKET_Shaft", S + "shaft/shaft_long.glb"),
    ("SOCKET_Vane", "public/assets/models/tockton/belfry/belfry_vane.glb"),
    ("SOCKET_Bell", "public/assets/models/tockton/clock_tower/clock_bell.glb"),
    ("SOCKET_BaseHandle", S + "interaction/machine_base_handle.glb"),
]
MACHINES = dict(
    well=dict(housing="public/assets/models/tockton/well/well_base.glb", parts=WELL),
    belfry=dict(housing="public/assets/models/tockton/belfry/belfry_base.glb", parts=BELFRY),
)
