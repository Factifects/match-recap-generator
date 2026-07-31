import type { ComponentType, SVGProps } from "react";
import PaperAirplaneIcon from "@heroicons/react/24/solid/PaperAirplaneIcon";
import RocketLaunchIcon from "@heroicons/react/24/solid/RocketLaunchIcon";
import ServerIcon from "@heroicons/react/24/solid/ServerIcon";
import CircleStackIcon from "@heroicons/react/24/solid/CircleStackIcon";
import CloudIcon from "@heroicons/react/24/solid/CloudIcon";
import GlobeAltIcon from "@heroicons/react/24/solid/GlobeAltIcon";
import DevicePhoneMobileIcon from "@heroicons/react/24/solid/DevicePhoneMobileIcon";
import VideoCameraIcon from "@heroicons/react/24/solid/VideoCameraIcon";
import SignalIcon from "@heroicons/react/24/solid/SignalIcon";
import WifiIcon from "@heroicons/react/24/solid/WifiIcon";
import ShieldCheckIcon from "@heroicons/react/24/solid/ShieldCheckIcon";
import BoltIcon from "@heroicons/react/24/solid/BoltIcon";
import LockClosedIcon from "@heroicons/react/24/solid/LockClosedIcon";
import MagnifyingGlassIcon from "@heroicons/react/24/solid/MagnifyingGlassIcon";
import ExclamationTriangleIcon from "@heroicons/react/24/solid/ExclamationTriangleIcon";
import CheckCircleIcon from "@heroicons/react/24/solid/CheckCircleIcon";
import XCircleIcon from "@heroicons/react/24/solid/XCircleIcon";
import CpuChipIcon from "@heroicons/react/24/solid/CpuChipIcon";
import ViewfinderCircleIcon from "@heroicons/react/24/solid/ViewfinderCircleIcon";
import ScaleIcon from "@heroicons/react/24/solid/ScaleIcon";
import BuildingOffice2Icon from "@heroicons/react/24/solid/BuildingOffice2Icon";
import UserIcon from "@heroicons/react/24/solid/UserIcon";
import BeakerIcon from "@heroicons/react/24/solid/BeakerIcon";
import BanknotesIcon from "@heroicons/react/24/solid/BanknotesIcon";
import WalletIcon from "@heroicons/react/24/solid/WalletIcon";
import ChartBarIcon from "@heroicons/react/24/solid/ChartBarIcon";
import MicrophoneIcon from "@heroicons/react/24/solid/MicrophoneIcon";
import SpeakerWaveIcon from "@heroicons/react/24/solid/SpeakerWaveIcon";
import SpeakerXMarkIcon from "@heroicons/react/24/solid/SpeakerXMarkIcon";
import TrashIcon from "@heroicons/react/24/solid/TrashIcon";
import DocumentTextIcon from "@heroicons/react/24/solid/DocumentTextIcon";
import CursorArrowRippleIcon from "@heroicons/react/24/solid/CursorArrowRippleIcon";
import SparklesIcon from "@heroicons/react/24/solid/SparklesIcon";
import ScissorsIcon from "@heroicons/react/24/solid/ScissorsIcon";
import EnvelopeIcon from "@heroicons/react/24/solid/EnvelopeIcon";
import KeyIcon from "@heroicons/react/24/solid/KeyIcon";
import IdentificationIcon from "@heroicons/react/24/solid/IdentificationIcon";
import FunnelIcon from "@heroicons/react/24/solid/FunnelIcon";
import TagIcon from "@heroicons/react/24/solid/TagIcon";
import type { CanvasIconKey } from "../model/visualDefinitions";

// The rendering half of Canvas's icon vocabulary — CANVAS_ICON_KEYS itself
// (the data-level allow-list) lives in model/visualDefinitions.ts so the
// model layer never has to import React/Heroicons; this file just maps each
// key to its real component. Solid (filled) variant specifically, to match
// Canvas's other shapes (rectangle/circle/polygon are all flat filled, no
// stroke-outline) — the football ICON_KEYS system uses a hand-drawn stroke
// look instead, a deliberate different register for a different scene type,
// not something to unify with this.
export const CANVAS_ICON_COMPONENTS: Record<CanvasIconKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  jet: PaperAirplaneIcon,
  rocket: RocketLaunchIcon,
  server: ServerIcon,
  database: CircleStackIcon,
  cloud: CloudIcon,
  globe: GlobeAltIcon,
  device: DevicePhoneMobileIcon,
  camera: VideoCameraIcon,
  signal: SignalIcon,
  wifi: WifiIcon,
  shield: ShieldCheckIcon,
  bolt: BoltIcon,
  lock: LockClosedIcon,
  search: MagnifyingGlassIcon,
  warning: ExclamationTriangleIcon,
  check: CheckCircleIcon,
  cross: XCircleIcon,
  chip: CpuChipIcon,
  target: ViewfinderCircleIcon,
  scale: ScaleIcon,
  factory: BuildingOffice2Icon,
  person: UserIcon,
  flask: BeakerIcon,
  cash: BanknotesIcon,
  wallet: WalletIcon,
  chart: ChartBarIcon,
  mic: MicrophoneIcon,
  speaker: SpeakerWaveIcon,
  mute: SpeakerXMarkIcon,
  trash: TrashIcon,
  document: DocumentTextIcon,
  cursor: CursorArrowRippleIcon,
  sparkle: SparklesIcon,
  scissors: ScissorsIcon,
  envelope: EnvelopeIcon,
  key: KeyIcon,
  identification: IdentificationIcon,
  funnel: FunnelIcon,
  tag: TagIcon,
};
