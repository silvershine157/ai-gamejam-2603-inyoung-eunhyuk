# Phase 3 Implementation Guide

## Purpose

This document defines a stable implementation strategy for Phase 3 single-player gameplay.

The goal is not just to add more obstacles, but to build a reusable obstacle framework that:

- is track-aware
- is size-aware
- is debuggable
- is mathematically verifiable
- can be extended without turning the codebase into version-specific hardcoded logic

This guide assumes the current foundation already exists:

- track generation and validation
- road / wall / offroad / respawn logic
- collision and bounce response
- size transformation
- cannon and projectile basics
- HUD and QA recording


## Phase 3 Goal

Phase 3 should produce a polished 1-player track experience where the player is constantly deciding:

- when to grow
- when to shrink
- when to prioritize racing line
- when to shoot
- when to take a safer route
- when to risk a faster route

The core loop should be:

1. Read obstacle
2. Choose size and line
3. Execute
4. Recover or exploit outcome
5. Repeat


## Design Principles

### 1. Obstacles must express the size mechanic

Every obstacle should create a meaningful size-dependent tradeoff.

- Big should feel powerful, stable, and dangerous to others.
- Small should feel agile, precise, and fragile.
- Obstacles should not be neutral decoration.

Each obstacle should fall into at least one category:

- big-favored
- small-favored
- punish-big
- punish-small
- size-switch-forcing


### 2. Obstacles must be parametric

No obstacle should be authored as a one-off hardcoded scene script.

Every obstacle should be definable by:

- type
- track anchor
- size
- motion parameters
- collision parameters
- gameplay parameters


### 3. Visuals and gameplay must be separate

Each obstacle should have:

- a visual representation
- a gameplay state
- a collider set
- optional trigger volumes

The visual mesh must not be the source of truth for gameplay logic.


### 4. Debugging is part of implementation

Phase 3 should not be built first and debugged later.

Every new obstacle type should come with:

- visual debug overlay
- logic debug state
- scripted validation
- playable QA path


## Core Runtime Structure

This is the most important structural rule for Phase 3.

Obstacles must not be implemented as ad hoc scene code scattered across the file.
They should be unified as track-aware objects that follow one common lifecycle.

Recommended split:

- `TrackObject`
- `ObstacleInstance`


## TrackObject

`TrackObject` is the reusable obstacle definition or factory.

It is responsible for:

- taking a track anchor
- taking obstacle params
- creating the runtime instance
- ensuring the obstacle is spawned in a track-aware way

Recommended shape:

```ts
interface TrackObject {
  type: string;
  spawn(trackAnchor: TrackAnchor, params: unknown): ObstacleInstance;
}
```

The important point is that authoring logic and runtime logic are not the same thing.

- `TrackObject` defines how an obstacle type is created
- `ObstacleInstance` is the live object currently in the world


## ObstacleInstance

`ObstacleInstance` is the live runtime object that participates in the game loop.

It should own:

- visual mesh or root object
- collider set
- optional motion controller
- optional damageable behavior
- optional weapon behavior
- optional respawn / fail / trigger behavior

Recommended shape:

```ts
interface ObstacleInstance {
  id: string;
  type: string;
  root: THREE.Object3D;
  update(dt: number, worldState: WorldState): void;
  getColliders(): Collider[];
  getDebugState(): unknown;
  dispose(): void;
}
```


## Common Lifecycle

All obstacle types should follow the same lifecycle:

1. `spawn(trackAnchor, params)`
2. register visual root
3. register colliders / triggers
4. update each frame
5. answer collision queries
6. expose debug state
7. dispose cleanly

This should be true for all of the following:

- trees
- moving shuttle blocks
- turrets
- destructible obstacles
- pit triggers

These are different gameplay objects, but they should still follow the same runtime contract.

That consistency is what makes the system stable and debuggable.


## Why this matters

If trees, moving blockers, turrets, destructibles, and pit triggers all use different custom update and collision patterns, Phase 3 will become difficult to reason about.

Using a common `TrackObject -> ObstacleInstance` flow gives us:

- reusable placement
- reusable collider handling
- reusable debug tooling
- reusable QA hooks
- fewer one-off bugs
- easier map authoring


## Recommended Architecture

## Core Layers

Separate the implementation into four layers.

### Layer 1. Track Geometry

Owns:

- spline / centerline
- tangent / right / up basis
- road width
- wall ranges
- pit ranges
- finish line
- map bounds

This layer should answer questions like:

- where is the player relative to the track?
- what is the local tangent/right at progress `s`?
- is a point on road?
- is a point in pit?


### Layer 2. Placement

Owns:

- obstacle placement on the track
- conversion from track-space to world-space
- anchor-based spawning

This layer should use track-space coordinates:

- `s`: progress along spline
- `n`: lateral offset along track right
- `y`: vertical offset
- `heading`: orientation mode or additional yaw

This is critical. Obstacles should not be placed with raw world coordinates unless there is a special reason.


### Layer 3. Collision / Physics

Owns:

- collider generation
- broadphase queries
- overlap checks
- triggers
- collision response hooks

This layer should stay primitive-based for stability.

Recommended primitive types:

- sphere
- box
- capsule
- segment

Avoid mesh-triangle collision for gameplay objects unless there is a strong need.


### Layer 4. Gameplay

Owns:

- damage
- destruction
- turret logic
- projectile logic
- moving obstacle state
- obstacle-specific interaction with size

This layer should never have to know how to compute spline geometry directly.


## Obstacle Framework

## Common Obstacle Contract

Every obstacle instance should follow a common interface.

```ts
type TrackAnchor = {
  s: number;
  n?: number;
  y?: number;
  headingMode?: 'track_tangent' | 'custom';
  headingOffset?: number;
};

type ObstacleContext = {
  track: TrackSystem;
  player: PlayerState;
  time: number;
  dt: number;
};

interface ObstacleInstance {
  id: string;
  type: string;
  root: THREE.Object3D;
  update(ctx: ObstacleContext): void;
  getColliders(): Collider[];
  getTriggers(): TriggerVolume[];
  getDebugState(): unknown;
  dispose(): void;
}
```

This does not need to be literal TypeScript today, but the structure should be honored.


## Obstacle Definition Format

Recommended data-driven schema:

```json
{
  "id": "gate_01",
  "type": "narrow_gate",
  "anchor": {
    "s": 0.18,
    "n": 0.0,
    "y": 0.0,
    "headingMode": "track_tangent",
    "headingOffset": 0.0
  },
  "params": {
    "width": 2.2,
    "height": 2.8,
    "penalty": "slowdown"
  },
  "tags": ["small_favored"]
}
```

This format makes it easy to:

- move obstacles to a different map
- replay bug reports
- generate debug labels
- write validator scripts


## Recommended Obstacle Base Types

Phase 3 should start from a small set of reusable base classes.

- `StaticObstacle`
- `MovingObstacle`
- `TurretObstacle`
- `PitObstacle`
- `DestructibleObstacle`
- `TriggerOnlyObstacle`

Concrete obstacle types should be specializations of these.


## Collider System

## Why collider reuse matters

Phase 3 will fail to scale if every obstacle manually defines its own collision math in an ad hoc way.

We need a reusable collider pipeline.


## Collider Representation

Recommended collider schema:

```ts
type Collider =
  | {
      kind: 'sphere';
      centerLocal: Vec3;
      radius: number;
      ownerId: string;
      tag?: string;
    }
  | {
      kind: 'box';
      centerLocal: Vec3;
      halfExtents: Vec3;
      rotationLocal: Quat;
      ownerId: string;
      tag?: string;
    }
  | {
      kind: 'capsule';
      aLocal: Vec3;
      bLocal: Vec3;
      radius: number;
      ownerId: string;
      tag?: string;
    };
```

All colliders should be stored in local space and transformed to world space at query time from the obstacle root transform.


## Automatic Collider Assignment

This is strongly recommended.

### Rule 1. Named child nodes create explicit colliders

If an obstacle asset contains child objects with specific prefixes, build colliders automatically.

- `col_box_*`
- `col_sphere_*`
- `col_capsule_*`
- `trigger_*`

This allows visual assets and gameplay colliders to be authored together while still remaining structured.


### Rule 2. Fallback primitive generation

If explicit collider nodes do not exist, generate fallback colliders from bounds.

Suggested heuristic:

- near-cubic -> sphere or box
- long and thin -> capsule
- wide and flat -> box

This fallback is useful for prototypes and automated tests.


### Rule 3. Separate solid collision from trigger logic

Do not mix these.

- solid colliders block / bounce / push
- trigger colliders notify gameplay systems

Examples:

- pit area is usually trigger-only
- turret detection zone is trigger-only
- barrier block is solid


## Track-Aware Placement

## Placement Function

Every obstacle should be created through a placement function that converts track-space to world-space.

Recommended helper:

```ts
placeTrackObject(anchor, trackFrameAtS)
```

The helper should output:

- world position
- tangent
- right
- up
- orientation quaternion


## Advantages

This gives us:

- automatic placement on any map
- reusable obstacle configs across maps
- predictable motion along track-local axes
- easier debugging because every obstacle has a known `s`


## Dynamic Obstacles

Dynamic obstacles should move in track-local coordinates, not arbitrary world coordinates.

Example for a shuttle obstacle:

- base anchor at `s = 0.36`
- oscillates along track right vector
- amplitude = `2.5`
- frequency = `0.7`

This keeps the behavior stable even if the track shape changes.


## Turret Design

Turrets should use a two-stage behavior.

### Stage 1. Aim

- rotate the barrel toward the player
- clamp angular speed
- expose visible telegraph
- optionally expose a debug aim ray

### Stage 2. Fire

- when fired, snapshot the barrel forward vector
- projectile then travels in a straight line
- projectile does not keep retargeting after launch

This matches the intended design and is easier to debug.


## Pit / Cliff Design

Pits should not be modeled as a special case of wall collision.

They should be their own trigger-based system.

Suggested behavior:

- define pit regions as track-linked trigger zones
- if player enters pit trigger, start fall / fail sequence
- disable normal road support logic
- after brief feedback, respawn from safe snapshot

Important:

- pit triggers must be visibly telegraphed
- pit zones should be represented in debug overlay
- pit triggers and wall colliders must not overlap ambiguously


## Destructible Obstacle Design

All destructible obstacles should share a common color language and common gameplay contract.

Recommended:

- all destructible obstacles use one consistent accent color
- all expose HP and optional damage multiplier
- all can report `destroyed / active / damaged`

Destructibles should support:

- projectile hit
- optional size-based damage modifier
- optional state transitions like opened / broken / disabled


## Collision Response Strategy

For obstacle collisions, keep the current stable philosophy:

- player uses primitive proxy
- obstacle uses primitive collider set
- find earliest contact
- stop at contact-safe position
- apply impact impulse over time

Do not revert to teleport-like reflection logic.

Different obstacle categories should control:

- restitution
- speed retention
- damage
- whether they block, push, or trigger only


## Debug System Requirements

Phase 3 should include a proper debug overlay system.

Recommended toggles:

- `F2`: show solid colliders
- `F3`: show trigger volumes
- `F4`: show obstacle ids and type labels
- `F5`: show track basis vectors
- `F6`: show turret aim rays and projectile vectors
- `F7`: show placement anchors
- `F8`: show pit zones and respawn snapshots


## Required On-Screen Debug Data

For the currently selected obstacle or latest collision:

- obstacle id
- obstacle type
- last collider id
- collision normal
- impact speed
- trigger enter / exit state
- player size
- player speed
- player track progress


## Required Global Debug API

Extend the runtime debug hook pattern already used in the project.

Recommended fields:

```ts
window.__phase3Debug.getState()
```

Should expose:

- active map id
- player state
- current size
- ammo
- score
- active obstacle ids
- active collisions
- last trigger event
- respawn count
- pit state
- turret aim state


## Validation Scripts

Phase 3 should ship with math / logic validation scripts, not just gameplay recording.

Minimum validators:

### 1. Placement validation

Check that obstacles:

- are not spawned on forbidden road space unless intended
- do not overlap each other beyond tolerance
- do not overlap grandstands or static scenery incorrectly
- do not overlap finish line or start spawn zone


### 2. Motion validation

Check that moving obstacles:

- move only along allowed axes
- remain inside allowed amplitude bounds
- do not phase through forbidden geometry


### 3. Turret validation

Check that:

- barrel forward at fire time is near player direction
- projectile initial direction matches barrel forward
- projectile remains straight after firing


### 4. Pit validation

Check that:

- pit trigger is reachable only where intended
- pit trigger is not inside wall-capped safe road by mistake
- respawn is triggered consistently


### 5. Destructible validation

Check that:

- projectile hits decrement HP
- obstacle enters destroyed state at correct threshold
- destroyed obstacle collider behavior changes correctly


## QA Workflow

Use both video QA and structured state capture.

### Video QA

Continue using recorded runs to inspect:

- readability
- telegraph clarity
- feel of bounce and failure states
- whether the obstacle asks for size decisions clearly


### Structured QA

In addition to video, record per-step state snapshots.

Recommended fields:

- time
- player speed
- size
- track progress
- obstacle proximity
- collision count
- trigger count
- ammo
- target hits
- respawn count

This makes it possible to detect logic bugs even when the video "looks mostly fine."


## Recommended Implementation Order

## Phase 3A. Foundation

- define obstacle base interface
- define collider representation
- implement track-anchor placement helpers
- implement debug overlay toggles


## Phase 3B. First obstacle set

- static blocker
- moving shuttle blocker
- pit trigger
- destructible blocker
- turret

Only after these five are stable should more obstacle types be added.


## Phase 3C. Validation

- obstacle placement validator
- turret aim validator
- pit coverage validator
- structured QA logging


## Phase 3D. Course design

- create one tutorial section per obstacle type
- create one mixed section requiring repeated size changes
- create one high-risk high-reward section


## Suggested Folder / Module Direction

If the project continues to evolve, the code should move toward something like:

```text
phase3/
  track/
  obstacles/
  colliders/
  gameplay/
  debug/
  qa/
```

Even if implementation remains in a single prototype file at first, code should still be grouped mentally in this shape.


## Definition of Done for a New Obstacle Type

A new obstacle type is not complete until all of the following are true:

- it is data-driven
- it can be placed by track anchor
- it has reusable colliders
- it exposes debug state
- it is visible in overlay mode
- it passes its validator script
- it is included in at least one recorded QA scenario
- it expresses a meaningful size tradeoff


## Immediate Recommendation

Before implementing lots of new content, first build:

1. obstacle base interface
2. auto-collider generator
3. debug overlay system
4. structured debug API
5. obstacle placement validator

Without these five pieces, Phase 3 will become difficult to extend and difficult to trust.
