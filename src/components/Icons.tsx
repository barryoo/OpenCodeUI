// Icon components extracted from the prototype

export const ChevronDownIcon = ({ size = 12 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

export const NewChatIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M10 2.5C14.1421 2.5 17.5 5.85786 17.5 10C17.5 14.1421 14.1421 17.5 10 17.5H3C2.79779 17.5 2.61549 17.3782 2.53809 17.1914C2.4607 17.0046 2.50349 16.7895 2.64648 16.6465L4.35547 14.9365C3.20124 13.6175 2.5 11.8906 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5ZM10 3.5C6.41015 3.5 3.5 6.41015 3.5 10C3.5 11.7952 4.22659 13.4199 5.40332 14.5967L5.46582 14.6729C5.52017 14.7544 5.5498 14.8508 5.5498 14.9502C5.5498 15.0828 5.49709 15.2099 5.40332 15.3037L4.20703 16.5H10C13.5899 16.5 16.5 13.5899 16.5 10C16.5 6.41015 13.5899 3.5 10 3.5ZM10 7C10.2761 7 10.5 7.22386 10.5 7.5V9.5H12.5C12.7761 9.5 13 9.72386 13 10C13 10.2761 12.7761 10.5 12.5 10.5H10.5V12.5C10.5 12.7761 10.2761 13 10 13C9.72386 13 9.5 12.7761 9.5 12.5V10.5H7.5C7.22386 10.5 7 10.2761 7 10C7 9.72386 7.22386 9.5 7.5 9.5H9.5V7.5C9.5 7.22386 9.72386 7 10 7Z" />
  </svg>
)

export const MenuDotsIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M10 14C10.5523 14 11 14.4477 11 15C11 15.5523 10.5523 16 10 16C9.44772 16 9 15.5523 9 15C9 14.4477 9.44772 14 10 14ZM10 9C10.5523 9 11 9.44772 11 10C11 10.5523 10.5523 11 10 11C9.44772 11 9 10.5523 9 10C9 9.44772 9.44772 9 10 9ZM10 4C10.5523 4 11 4.44772 11 5C11 5.55228 10.5523 6 10 6C9.44772 6 9 5.55228 9 5C9 4.44772 9.44772 4 10 4Z" />
  </svg>
)

export const HandIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M10.25 2C11.0283 2 11.6867 2.50842 11.9141 3.21094C12.1623 3.07581 12.4475 3 12.75 3C13.7165 3 14.5 3.7835 14.5 4.75V6.16992C14.7275 6.06176 14.9814 6 15.25 6C16.2165 6 17 6.7835 17 7.75V11.25C17 14.9779 13.9779 18 10.25 18C6.52208 18 3.5 14.9779 3.5 11.25V8C3.5 7.44772 3.94772 7 4.5 7H5C5.36464 7 5.70563 7.09906 6 7.26953V4.75C6 3.7835 6.7835 3 7.75 3C8.05224 3 8.33688 3.07606 8.58496 3.21094C8.81229 2.50827 9.47163 2 10.25 2ZM10.25 3C9.83579 3 9.5 3.33579 9.5 3.75V9.5C9.5 9.77614 9.27614 10 9 10C8.72386 10 8.5 9.77614 8.5 9.5V4.75C8.5 4.33579 8.16421 4 7.75 4C7.33579 4 7 4.33579 7 4.75V11.002C8.32553 11.0277 9.48461 11.8814 9.90918 13.1221L9.98535 13.3789L10 13.4785C10.0102 13.711 9.85565 13.9267 9.62109 13.9854C9.38677 14.0438 9.1493 13.9264 9.04883 13.7168L9.01465 13.6211L8.96289 13.4463C8.66901 12.5877 7.85929 12 6.93848 12H6.5C6.22386 12 6 11.7761 6 11.5V9C6 8.44772 5.55228 8 5 8H4.5V11.25C4.5 14.4256 7.07436 17 10.25 17C13.4256 17 16 14.4256 16 11.25V7.75C16 7.33579 15.6642 7 15.25 7C14.8358 7 14.5 7.33579 14.5 7.75V10.5C14.5 10.7761 14.2761 11 14 11C13.7239 11 13.5 10.7761 13.5 10.5V4.75C13.5 4.33579 13.1642 4 12.75 4C12.3358 4 12 4.33579 12 4.75V9.5C12 9.77614 11.7761 10 11.5 10C11.2239 10 11 9.77614 11 9.5V3.75C11 3.33579 10.6642 3 10.25 3Z" />
  </svg>
)

export const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const SendIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    fill="currentColor"
    viewBox="0 0 256 256"
  >
    <path d="M208.49,120.49a12,12,0,0,1-17,0L140,69V216a12,12,0,0,1-24,0V69L64.49,120.49a12,12,0,0,1-17-17l72-72a12,12,0,0,1,17,0l72,72A12,12,0,0,1,208.49,120.49Z" />
  </svg>
)

export const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M10 3C10.2761 3 10.5 3.22386 10.5 3.5V9.5H16.5L16.6006 9.50977C16.8286 9.55629 17 9.75829 17 10C17 10.2417 16.8286 10.4437 16.6006 10.4902L16.5 10.5H10.5V16.5C10.5 16.7761 10.2761 17 10 17C9.72386 17 9.5 16.7761 9.5 16.5V10.5H3.5C3.22386 10.5 3 10.2761 3 10C3 9.72386 3.22386 9.5 3.5 9.5H9.5V3.5C9.5 3.22386 9.72386 3 10 3Z" />
  </svg>
)

export const TeachIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M10.8139 17.5841L7.08902 8.12868C6.76198 7.29851 7.60347 6.48813 8.42074 6.84621L17.6697 10.8985C18.6008 11.3065 18.4 12.6821 17.3912 12.8069L14.3103 13.1881C13.8869 13.2405 13.5433 13.5557 13.4548 13.973L12.7225 17.4251C12.5168 18.3949 11.1772 18.5065 10.8139 17.5841Z"
      stroke="currentColor"
      strokeWidth="1"
    />
    <path d="M5 5L3 3" stroke="currentColor" strokeLinecap="round" />
    <path d="M8.36609 3.82843L8.36609 1.63391" stroke="currentColor" strokeLinecap="round" />
    <path d="M3.82843 8.4624H1.5376" stroke="currentColor" strokeLinecap="round" />
  </svg>
)

export const SettingsIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M10.5488 2C11.3503 2 12.0258 2.59557 12.1279 3.39062L12.2441 4.35156C12.2946 4.76923 12.5763 5.12341 12.9717 5.26172C13.3672 5.40002 13.8088 5.29754 14.1094 4.99609L14.7949 4.31055C15.3691 3.73633 16.2949 3.71289 16.8965 4.25781L17.7422 5.10352C18.2871 5.70508 18.2637 6.63086 17.6895 7.20508L17.0039 7.89062C16.7025 8.19141 16.5999 8.63281 16.7383 9.02832C16.8767 9.42383 17.231 9.70605 17.6484 9.75586L18.6094 9.87207C19.4043 9.97412 20 10.6494 20 11.4512V12.5488C20 13.3503 19.4044 14.0258 18.6094 14.1279L17.6484 14.2441C17.2307 14.2946 16.8766 14.5763 16.7383 14.9717C16.6 15.3672 16.7025 15.8088 17.0039 16.1094L17.6895 16.7949C18.2637 17.3691 18.2871 18.2949 17.7422 18.8965L16.8965 19.7422C16.2949 20.2871 15.3691 20.2637 14.7949 19.6895L14.1094 19.0039C13.8086 18.7025 13.3672 18.5999 12.9717 18.7383C12.5762 18.8767 12.2939 19.231 12.2441 19.6484L12.1279 20.6094C12.0259 21.4043 11.3506 22 10.5488 22H9.45117C8.64972 22 7.97418 21.4044 7.87207 20.6094L7.75586 19.6484C7.70535 19.2307 7.42371 18.8766 7.02832 18.7383C6.63294 18.6 6.19121 18.7025 5.89062 19.0039L5.20508 19.6895C4.63086 20.2637 3.70508 20.2871 3.10352 19.7422L2.25781 18.8965C1.71289 18.2949 1.73633 17.3691 2.31055 16.7949L2.99609 16.1094C3.29754 15.8086 3.40002 15.3672 3.26172 14.9717C3.12341 14.5762 2.76903 14.2939 2.35156 14.2441L1.39062 14.1279C0.59557 14.0259 0 13.3506 0 12.5488V11.4512C0 10.6497 0.59557 9.97418 1.39062 9.87207L2.35156 9.75586C2.76923 9.70535 3.12341 9.42371 3.26172 9.02832C3.40002 8.63294 3.29754 8.19121 2.99609 7.89062L2.31055 7.20508C1.73633 6.63086 1.71289 5.70508 2.25781 5.10352L3.10352 4.25781C3.70508 3.71289 4.63086 3.73633 5.20508 4.31055L5.89062 4.99609C6.19141 5.29754 6.63281 5.40002 7.02832 5.26172C7.42383 5.12341 7.70605 4.76903 7.75586 4.35156L7.87207 3.39062C7.97412 2.59557 8.64941 2 9.45117 2H10.5488ZM10 7C8.34314 7 7 8.34314 7 10C7 11.6569 8.34314 13 10 13C11.6569 13 13 11.6569 13 10C13 8.34314 11.6569 7 10 7Z" />
  </svg>
)

export const BoltIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M14.9744 7.27177C15.5096 6.92847 15.3479 6.10742 14.7178 5.98652L10.6665 5.21004L12.1611 1.64014C12.3737 1.13249 11.7529 0.685577 11.3283 1.04568L3.50024 7.68805C3.00708 8.1064 3.24993 8.90063 3.88593 8.95625L7.20068 9.24605L5.02832 14.0967C4.7687 14.6762 5.51152 15.1509 5.97241 14.7106L14.9744 7.27177Z" />
  </svg>
)

export const SunIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M10 2.5C10.2761 2.5 10.5 2.72386 10.5 3V4C10.5 4.27614 10.2761 4.5 10 4.5C9.72386 4.5 9.5 4.27614 9.5 4V3C9.5 2.72386 9.72386 2.5 10 2.5ZM10 6C7.79086 6 6 7.79086 6 10C6 12.2091 7.79086 14 10 14C12.2091 14 14 12.2091 14 10C14 7.79086 12.2091 6 10 6ZM7 10C7 8.34315 8.34315 7 10 7C11.6569 7 13 8.34315 13 10C13 11.6569 11.6569 13 10 13C8.34315 13 7 11.6569 7 10ZM10 15.5C10.2761 15.5 10.5 15.7239 10.5 16V17C10.5 17.2761 10.2761 17.5 10 17.5C9.72386 17.5 9.5 17.2761 9.5 17V16C9.5 15.7239 9.72386 15.5 10 15.5ZM17.5 10C17.5 10.2761 17.2761 10.5 17 10.5H16C15.7239 10.5 15.5 10.2761 15.5 10C15.5 9.72386 15.7239 9.5 16 9.5H17C17.2761 9.5 17.5 9.72386 17.5 10ZM4 10.5C4.27614 10.5 4.5 10.2761 4.5 10C4.5 9.72386 4.27614 9.5 4 9.5H3C2.72386 9.5 2.5 9.72386 2.5 10C2.5 10.2761 2.72386 10.5 3 10.5H4ZM15.3033 4.6967C15.4986 4.89196 15.4986 5.20854 15.3033 5.40381L14.5962 6.11091C14.4009 6.30618 14.0843 6.30618 13.8891 6.11091C13.6938 5.91565 13.6938 5.59907 13.8891 5.40381L14.5962 4.6967C14.7914 4.50144 15.1081 4.50144 15.3033 4.6967ZM6.11091 13.8891C6.30618 13.6938 6.30618 13.3772 6.11091 13.182C5.91565 12.9867 5.59907 12.9867 5.40381 13.182L4.6967 13.8891C4.50144 14.0843 4.50144 14.4009 4.6967 14.5962C4.89196 14.7914 5.20854 14.7914 5.40381 14.5962L6.11091 13.8891ZM15.3033 15.3033C15.1081 15.4986 14.7914 15.4986 14.5962 15.3033L13.8891 14.5962C13.6938 14.4009 13.6938 14.0843 13.8891 13.8891C14.0843 13.6938 14.4009 13.6938 14.5962 13.8891L15.3033 14.5962C15.4986 14.7914 15.4986 15.1081 15.3033 15.3033ZM5.40381 6.11091C5.59907 6.30618 5.91565 6.30618 6.11091 6.11091C6.30618 5.91565 6.30618 5.59907 6.11091 5.40381L5.40381 4.6967C5.20854 4.50144 4.89196 4.50144 4.6967 4.6967C4.50144 4.89196 4.50144 5.20854 4.6967 5.40381L5.40381 6.11091Z" />
  </svg>
)

export const MoonIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M7.5 2C7.72616 2 7.92907 2.13803 8.01234 2.34753C8.09561 2.55703 8.04281 2.79466 7.87873 2.95001C6.72004 4.05493 6 5.62647 6 7.36842C6 10.7204 8.74218 13.4211 12.1458 13.4211C13.3649 13.4211 14.4977 13.0653 15.4584 12.4537C15.6545 12.329 15.9062 12.3399 16.0909 12.4814C16.2756 12.6229 16.3543 12.8662 16.2885 13.0934C15.2984 16.5118 12.1341 19 8.36842 19C3.74661 19 0 15.2893 0 10.7105C0 6.47037 3.22188 2.98024 7.34207 2.51356C7.39432 2.50711 7.44718 2.50387 7.5 2.50387V2Z" />
  </svg>
)

export const SystemIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M3 4.5C3 3.67157 3.67157 3 4.5 3H15.5C16.3284 3 17 3.67157 17 4.5V12.5C17 13.3284 16.3284 14 15.5 14H4.5C3.67157 14 3 13.3284 3 12.5V4.5ZM4.5 4C4.22386 4 4 4.22386 4 4.5V12.5C4 12.7761 4.22386 13 4.5 13H15.5C15.7761 13 16 12.7761 16 12.5V4.5C16 4.22386 15.7761 4 15.5 4H4.5ZM6 16C5.72386 16 5.5 16.2239 5.5 16.5C5.5 16.7761 5.72386 17 6 17H14C14.2761 17 14.5 16.7761 14.5 16.5C14.5 16.2239 14.2761 16 14 16H6Z" />
  </svg>
)

export const SidebarIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
)

export const StopIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="12" height="12" rx="2" />
  </svg>
)

export const ImageIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

export const CopyIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
)

export const AgentIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
  </svg>
)

export const CloseIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M4.08859 4.21569L4.14645 4.14645C4.32001 3.97288 4.58944 3.9536 4.78431 4.08859L4.85355 4.14645L10 9.293L15.1464 4.14645C15.32 3.97288 15.5894 3.9536 15.7843 4.08859L15.8536 4.14645C16.0271 4.32001 16.0464 4.58944 15.9114 4.78431L15.8536 4.85355L10.707 10L15.8536 15.1464C16.0271 15.32 16.0464 15.5894 15.9114 15.7843L15.8536 15.8536C15.68 16.0271 15.4106 16.0464 15.2157 15.9114L15.1464 15.8536L10 10.707L4.85355 15.8536C4.67999 16.0271 4.41056 16.0464 4.21569 15.9114L4.14645 15.8536C3.97288 15.68 3.9536 15.4106 4.08859 15.2157L4.14645 15.1464L9.293 10L4.14645 4.85355C3.97288 4.67999 3.9536 4.41056 4.08859 4.21569L4.14645 4.14645L4.08859 4.21569Z" />
  </svg>
)

export const ThinkingIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4" />
    <path d="M22 5h-4" />
    <path d="M4 17v2" />
    <path d="M5 18H3" />
  </svg>
)

export const UndoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M7.70711 3.29289C8.09763 3.68342 8.09763 4.31658 7.70711 4.70711L5.41421 7H12C14.7614 7 17 9.23858 17 12C17 14.7614 14.7614 17 12 17H8C7.44772 17 7 16.5523 7 16C7 15.4477 7.44772 15 8 15H12C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9H5.41421L7.70711 11.2929C8.09763 11.6834 8.09763 12.3166 7.70711 12.7071C7.31658 13.0976 6.68342 13.0976 6.29289 12.7071L2.29289 8.70711C1.90237 8.31658 1.90237 7.68342 2.29289 7.29289L6.29289 3.29289C6.68342 2.90237 7.31658 2.90237 7.70711 3.29289Z" />
  </svg>
)

export const RedoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M12.2929 3.29289C12.6834 2.90237 13.3166 2.90237 13.7071 3.29289L17.7071 7.29289C18.0976 7.68342 18.0976 8.31658 17.7071 8.70711L13.7071 12.7071C13.3166 13.0976 12.6834 13.0976 12.2929 12.7071C11.9024 12.3166 11.9024 11.6834 12.2929 11.2929L14.5858 9H8C6.34315 9 5 10.3431 5 12C5 13.6569 6.34315 15 8 15H12C12.5523 15 13 15.4477 13 16C13 16.5523 12.5523 17 12 17H8C5.23858 17 3 14.7614 3 12C3 9.23858 5.23858 7 8 7H14.5858L12.2929 4.70711C11.9024 4.31658 11.9024 3.68342 12.2929 3.29289Z" />
  </svg>
)

export const TerminalIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
)

export const FileIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M6 2C4.89543 2 4 2.89543 4 4V16C4 17.1046 4.89543 18 6 18H14C15.1046 18 16 17.1046 16 16V7.41421C16 6.88378 15.7893 6.37507 15.4142 6L12 2.58579C11.6249 2.21071 11.1162 2 10.5858 2H6ZM5 4C5 3.44772 5.44772 3 6 3H10V6C10 7.10457 10.8954 8 12 8H15V16C15 16.5523 14.5523 17 14 17H6C5.44772 17 5 16.5523 5 16V4ZM14.5858 7H12C11.4477 7 11 6.55228 11 6V3.41421L14.5858 7Z" />
  </svg>
)

export const FolderIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M4 4C2.89543 4 2 4.89543 2 6V14C2 15.1046 2.89543 16 4 16H16C17.1046 16 18 15.1046 18 14V8C18 6.89543 17.1046 6 16 6H10.4142L8.70711 4.29289C8.51957 4.10536 8.26522 4 8 4H4ZM3 6C3 5.44772 3.44772 5 4 5H7.58579L9.29289 6.70711C9.48043 6.89464 9.73478 7 10 7H16C16.5523 7 17 7.44772 17 8V14C17 14.5523 16.5523 15 16 15H4C3.44772 15 3 14.5523 3 14V6Z" />
  </svg>
)

export const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path d="M8.5 3C11.5376 3 14 5.46243 14 8.5C14 9.83879 13.5217 11.0659 12.7266 12.0196L16.8536 16.1464C17.0488 16.3417 17.0488 16.6583 16.8536 16.8536C16.68 17.0271 16.4106 17.0464 16.2157 16.9114L16.1464 16.8536L12.0196 12.7266C11.0659 13.5217 9.83879 14 8.5 14C5.46243 14 3 11.5376 3 8.5C3 5.46243 5.46243 3 8.5 3ZM8.5 4C6.01472 4 4 6.01472 4 8.5C4 10.9853 6.01472 13 8.5 13C10.9853 13 13 10.9853 13 8.5C13 6.01472 10.9853 4 8.5 4Z" />
  </svg>
)

export const AtIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 20 20"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18C11.8487 18 13.551 17.3729 14.9056 16.3199L14.9551 16.2812C15.1797 16.1094 15.5 16.2656 15.5 16.5527V16.5527C15.5 16.7988 15.3008 17 15.0547 17V17C13.5713 17.6479 11.9478 18 10.25 18C5.69365 18 2 14.3063 2 9.75C2 5.19365 5.69365 1.5 10.25 1.5C14.8063 1.5 18.5 5.19365 18.5 9.75C18.5 11.0078 18.2109 12.1953 17.6953 13.2461C17.4199 13.7969 16.8633 14.125 16.25 14.125C15.4258 14.125 14.75 13.4492 14.75 12.625V9.75C14.75 7.26472 12.7353 5.25 10.25 5.25C7.76472 5.25 5.75 7.26472 5.75 9.75C5.75 12.2353 7.76472 14.25 10.25 14.25C11.4092 14.25 12.4648 13.8047 13.2617 13.0781C13.5723 13.7734 14.2617 14.25 15.0625 14.25C16.0664 14.25 16.9004 13.6035 17.1895 12.7109C17.6348 11.793 17.875 10.7656 17.875 9.6875C17.875 5.58203 14.543 2.25 10.4375 2.25C6.33203 2.25 3 5.58203 3 9.6875C3 13.793 6.33203 17.125 10.4375 17.125H10.5C10.7761 17.125 11 17.3489 11 17.625V17.625C11 17.9011 10.7761 18.125 10.5 18.125H10.25C5.69365 18.125 2 14.4314 2 9.875C2 5.31857 5.69365 1.625 10.25 1.625C14.8063 1.625 18.5 5.31857 18.5 9.875C18.5 11.1201 18.2188 12.2988 17.7168 13.3496C17.4531 13.877 16.9219 14.1875 16.3438 14.1875C15.5547 14.1875 14.9062 13.5391 14.9062 12.75V9.75C14.9062 7.19922 12.8008 5.09375 10.25 5.09375C7.69922 5.09375 5.59375 7.19922 5.59375 9.75C5.59375 12.3008 7.69922 14.4062 10.25 14.4062C11.4414 14.4062 12.5254 13.9473 13.3418 13.1934C13.6426 13.8594 14.3027 14.3125 15.0703 14.3125C16.041 14.3125 16.8516 13.6914 17.1543 12.8359C17.5859 11.9355 17.8203 10.9297 17.8203 9.875C17.8203 5.87695 14.623 2.625 10.625 2.625V2.625C10.625 2.34886 10.8489 2.125 11.125 2.125V2.125C11.4011 2.125 11.625 2.34886 11.625 2.625V2.625H10C5.58172 2.625 2 6.20672 2 10.625C2 15.0433 5.58172 18.625 10 18.625V18.625ZM10.25 6.5C12.0449 6.5 13.5 7.95507 13.5 9.75C13.5 11.5449 12.0449 13 10.25 13C8.45507 13 7 11.5449 7 9.75C7 7.95507 8.45507 6.5 10.25 6.5Z" />
  </svg>
)

// ============================================
// Stroke-style icons (for UI elements)
// ============================================

interface IconProps {
  size?: number
  className?: string
}

export const PencilIcon = ({ size = 14, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
)

export const ComposeIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export const CogIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const MoreHorizontalIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
)

export const TrashIcon = ({ size = 14, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

export const GridIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

export const ChevronRightIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const ReturnIcon = ({ size = 12, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="9 10 4 15 9 20" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </svg>
)

export const SpinnerIcon = ({ size = 14, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
  </svg>
)

export const LightningIcon = ({ size = 14, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
)

export const EyeIcon = ({ size = 14, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const MaximizeIcon = ({ size = 16, className }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
)

export const MinimizeIcon = ({ size = 16, className }: IconProps) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
  </svg>
)
