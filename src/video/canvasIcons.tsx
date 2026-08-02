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
import ClockIcon from "@heroicons/react/24/solid/ClockIcon";
import ArrowPathIcon from "@heroicons/react/24/solid/ArrowPathIcon";
import ComputerDesktopIcon from "@heroicons/react/24/solid/ComputerDesktopIcon";
import HandThumbUpIcon from "@heroicons/react/24/solid/HandThumbUpIcon";
import BellIcon from "@heroicons/react/24/solid/BellIcon";
import ChatBubbleLeftRightIcon from "@heroicons/react/24/solid/ChatBubbleLeftRightIcon";
import type { CanvasIconKey } from "../model/visualDefinitions";

// Real brand marks, not Heroicons — the same single-color monochrome SVG
// paths GitHub/Google/the JS Foundation ship via simple-icons.org (CC0),
// reproduced here as plain SVG components so each slots into
// CANVAS_ICON_COMPONENTS the exact same way a Heroicon does (viewBox 0 0 24
// 24, fill inherited from the `fill` prop via SVG's presentation-attribute
// inheritance). Use these instead of a generic "globe"/"cloud"/"chip" icon
// whenever a scene is specifically about that brand/tech, not the concept in
// the abstract (a script about CORS in a real Chrome tab wants the actual
// Chrome mark, not a generic globe standing in for "a browser").
const GithubLogoIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const GoogleLogoIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
  </svg>
);

const ChromeLogoIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 16.364a4.364 4.364 0 1 1 0-8.728 4.364 4.364 0 0 1 0 8.728Z" />
  </svg>
);

const JavascriptLogoIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M0 0h24v24H0V0zm22.034 18.276c-.175-1.095-.888-2.015-3.003-2.873-.736-.345-1.554-.585-1.797-1.14-.091-.33-.105-.51-.046-.705.15-.646.915-.84 1.515-.66.39.12.75.42.976.9 1.034-.676 1.034-.676 1.755-1.125-.27-.42-.404-.601-.586-.78-.63-.705-1.469-1.065-2.834-1.034l-.705.089c-.676.165-1.32.525-1.71 1.005-1.14 1.291-.811 3.541.569 4.471 1.365 1.02 3.361 1.244 3.616 2.205.24 1.17-.87 1.545-1.966 1.41-.811-.18-1.26-.586-1.755-1.336l-1.83 1.051c.21.48.45.689.81 1.109 1.74 1.756 6.09 1.666 6.871-1.004.029-.09.24-.705.074-1.65l.046.067zm-8.983-7.245h-2.248c0 1.938-.009 3.864-.009 5.805 0 1.232.063 2.363-.138 2.711-.33.689-1.18.601-1.566.48-.396-.196-.597-.466-.83-.855-.063-.105-.11-.196-.127-.196l-1.825 1.125c.305.63.75 1.172 1.324 1.517.855.51 2.004.675 3.207.405.783-.226 1.458-.691 1.811-1.411.51-.93.402-2.07.397-3.346.012-2.054 0-4.109 0-6.179l.004-.056z" />
  </svg>
);

const YoutubeLogoIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
);

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
  clock: ClockIcon,
  refresh: ArrowPathIcon,
  laptop: ComputerDesktopIcon,
  githubLogo: GithubLogoIcon,
  googleLogo: GoogleLogoIcon,
  chromeLogo: ChromeLogoIcon,
  javascriptLogo: JavascriptLogoIcon,
  youtubeLogo: YoutubeLogoIcon,
  thumbsUp: HandThumbUpIcon,
  bell: BellIcon,
  chat: ChatBubbleLeftRightIcon,
};
