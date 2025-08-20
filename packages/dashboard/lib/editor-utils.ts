/**
 * Editor utilities for opening projects in preferred code editors
 * 
 * Provides cross-platform support for launching various editors with project paths.
 * This file contains types and configurations - server-side functionality is in the API route.
 */

export interface EditorConfig {
  id: string;
  name: string;
  icon: string;
  commands: {
    darwin?: string[];     // macOS commands to try
    win32?: string[];      // Windows commands
    linux?: string[];      // Linux commands
  };
  detectPaths?: {
    darwin?: string[];     // macOS installation paths
    win32?: string[];      // Windows installation paths
    linux?: string[];      // Linux installation paths
  };
  requiresShell?: boolean; // If true, use shell execution
  supportsWSL?: boolean;   // Can open WSL paths from Windows
  platformRestricted?: string[]; // Restrict to specific platforms
}

export interface EditorSettings {
  defaultEditor: string;
  customCommand: string;
  autoDetect: boolean;
  openInNewWindow: boolean;
}

export const SUPPORTED_EDITORS: EditorConfig[] = [
  // Alphabetically sorted editors
  {
    id: 'atom',
    name: 'Atom',
    icon: '',
    commands: {
      darwin: ['atom'],
      win32: ['atom', 'atom.exe'],
      linux: ['atom']
    },
    detectPaths: {
      darwin: ['/Applications/Atom.app/Contents/Resources/app/atom.sh'],
      win32: ['%LOCALAPPDATA%\\atom\\bin\\atom.cmd'],
      linux: ['/usr/bin/atom']
    }
  },
  {
    id: 'brackets',
    name: 'Brackets',
    icon: '',
    commands: {
      darwin: ['brackets'],
      win32: ['brackets'],
      linux: ['brackets']
    },
    detectPaths: {
      darwin: ['/Applications/Brackets.app/Contents/command/brackets'],
      win32: ['%PROGRAMFILES%\\Brackets\\Brackets.exe'],
      linux: ['/usr/bin/brackets']
    }
  },
  {
    id: 'codeblocks',
    name: 'Code::Blocks',
    icon: '',
    commands: {
      darwin: ['codeblocks'],
      win32: ['codeblocks', 'codeblocks.exe'],
      linux: ['codeblocks']
    },
    detectPaths: {
      win32: ['%PROGRAMFILES%\\CodeBlocks\\codeblocks.exe'],
      linux: ['/usr/bin/codeblocks']
    }
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: '',
    commands: {
      darwin: ['cursor'],
      win32: ['cursor', 'cursor.exe'],
      linux: ['cursor']
    },
    detectPaths: {
      darwin: ['/Applications/Cursor.app/Contents/Resources/app/bin/cursor'],
      win32: ['%LOCALAPPDATA%\\Programs\\cursor\\cursor.exe'],
      linux: ['/usr/bin/cursor', '/usr/local/bin/cursor']
    },
    supportsWSL: true
  },
  {
    id: 'emacs',
    name: 'Emacs',
    icon: '',
    commands: {
      darwin: ['emacs'],
      win32: ['emacs', 'emacs.exe'],
      linux: ['emacs']
    },
    requiresShell: true
  },
  {
    id: 'fleet',
    name: 'Fleet',
    icon: '',
    commands: {
      darwin: ['fleet'],
      win32: ['fleet'],
      linux: ['fleet']
    },
    detectPaths: {
      darwin: ['/Applications/Fleet.app/Contents/MacOS/fleet'],
      win32: ['%LOCALAPPDATA%\\JetBrains\\Toolbox\\apps\\Fleet\\*\\fleet.exe'],
      linux: ['/usr/bin/fleet', '/usr/local/bin/fleet']
    }
  },
  {
    id: 'gedit',
    name: 'Gedit',
    icon: '',
    commands: {
      linux: ['gedit']
    },
    detectPaths: {
      linux: ['/usr/bin/gedit']
    },
    platformRestricted: ['linux']
  },
  {
    id: 'goland',
    name: 'GoLand',
    icon: '',
    commands: {
      darwin: ['goland'],
      win32: ['goland', 'goland64.exe'],
      linux: ['goland']
    },
    detectPaths: {
      darwin: ['/Applications/GoLand.app/Contents/bin/goland'],
      win32: ['%PROGRAMFILES%\\JetBrains\\GoLand*\\bin\\goland64.exe'],
      linux: ['/usr/bin/goland', '/opt/jetbrains/goland/bin/goland.sh']
    }
  },
  {
    id: 'intellij',
    name: 'IntelliJ IDEA',
    icon: '',
    commands: {
      darwin: ['idea'],
      win32: ['idea', 'idea64.exe'],
      linux: ['idea']
    },
    detectPaths: {
      darwin: ['/Applications/IntelliJ IDEA.app/Contents/bin/idea'],
      win32: ['%PROGRAMFILES%\\JetBrains\\IntelliJ IDEA*\\bin\\idea64.exe'],
      linux: ['/usr/bin/idea', '/opt/jetbrains/idea/bin/idea.sh']
    }
  },
  {
    id: 'kate',
    name: 'Kate',
    icon: '',
    commands: {
      linux: ['kate']
    },
    detectPaths: {
      linux: ['/usr/bin/kate']
    },
    platformRestricted: ['linux']
  },
  {
    id: 'nvim',
    name: 'Neovim',
    icon: '',
    commands: {
      darwin: ['nvim'],
      win32: ['nvim', 'nvim.exe'],
      linux: ['nvim']
    },
    requiresShell: true
  },
  {
    id: 'notepadplusplus',
    name: 'Notepad++',
    icon: '',
    commands: {
      win32: ['notepad++', 'notepad++.exe']
    },
    detectPaths: {
      win32: ['%PROGRAMFILES%\\Notepad++\\notepad++.exe']
    },
    platformRestricted: ['win32']
  },
  {
    id: 'nova',
    name: 'Nova',
    icon: '',
    commands: {
      darwin: ['nova']
    },
    detectPaths: {
      darwin: ['/Applications/Nova.app/Contents/SharedSupport/nova']
    },
    platformRestricted: ['darwin']
  },
  {
    id: 'phpstorm',
    name: 'PHPStorm',
    icon: '',
    commands: {
      darwin: ['phpstorm'],
      win32: ['phpstorm', 'phpstorm64.exe'],
      linux: ['phpstorm']
    },
    detectPaths: {
      darwin: ['/Applications/PhpStorm.app/Contents/bin/phpstorm'],
      win32: ['%PROGRAMFILES%\\JetBrains\\PhpStorm*\\bin\\phpstorm64.exe'],
      linux: ['/usr/bin/phpstorm', '/opt/jetbrains/phpstorm/bin/phpstorm.sh']
    }
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    icon: '',
    commands: {
      darwin: ['pycharm'],
      win32: ['pycharm', 'pycharm64.exe'],
      linux: ['pycharm']
    },
    detectPaths: {
      darwin: ['/Applications/PyCharm.app/Contents/bin/pycharm'],
      win32: ['%PROGRAMFILES%\\JetBrains\\PyCharm*\\bin\\pycharm64.exe'],
      linux: ['/usr/bin/pycharm', '/opt/jetbrains/pycharm/bin/pycharm.sh']
    }
  },
  {
    id: 'rubymine',
    name: 'RubyMine',
    icon: '',
    commands: {
      darwin: ['rubymine'],
      win32: ['rubymine', 'rubymine64.exe'],
      linux: ['rubymine']
    },
    detectPaths: {
      darwin: ['/Applications/RubyMine.app/Contents/bin/rubymine'],
      win32: ['%PROGRAMFILES%\\JetBrains\\RubyMine*\\bin\\rubymine64.exe'],
      linux: ['/usr/bin/rubymine', '/opt/jetbrains/rubymine/bin/rubymine.sh']
    }
  },
  {
    id: 'sublime',
    name: 'Sublime Text',
    icon: '',
    commands: {
      darwin: ['subl'],
      win32: ['subl', 'sublime_text'],
      linux: ['subl', 'sublime_text']
    },
    detectPaths: {
      darwin: ['/Applications/Sublime Text.app/Contents/SharedSupport/bin/subl'],
      win32: ['%PROGRAMFILES%\\Sublime Text\\subl.exe'],
      linux: ['/usr/bin/subl', '/opt/sublime_text/sublime_text']
    }
  },
  {
    id: 'textmate',
    name: 'TextMate',
    icon: '',
    commands: {
      darwin: ['mate']
    },
    detectPaths: {
      darwin: ['/Applications/TextMate.app/Contents/Resources/mate']
    },
    platformRestricted: ['darwin']
  },
  {
    id: 'vim',
    name: 'Vim',
    icon: '',
    commands: {
      darwin: ['vim'],
      win32: ['vim', 'vim.exe'],
      linux: ['vim']
    },
    requiresShell: true
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    icon: '',
    commands: {
      darwin: ['code'],
      win32: ['code', 'code.cmd'],
      linux: ['code']
    },
    detectPaths: {
      darwin: ['/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'],
      win32: [
        '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\bin\\code.cmd',
        '%PROGRAMFILES%\\Microsoft VS Code\\bin\\code.cmd'
      ],
      linux: ['/usr/bin/code', '/usr/local/bin/code', '/snap/bin/code']
    },
    supportsWSL: true
  },
  {
    id: 'visualstudio',
    name: 'Visual Studio',
    icon: '',
    commands: {
      win32: ['devenv']
    },
    detectPaths: {
      win32: ['%PROGRAMFILES%\\Microsoft Visual Studio\\*\\*\\Common7\\IDE\\devenv.exe']
    },
    platformRestricted: ['win32']
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    icon: '',
    commands: {
      darwin: ['webstorm'],
      win32: ['webstorm', 'webstorm64.exe'],
      linux: ['webstorm']
    },
    detectPaths: {
      darwin: ['/Applications/WebStorm.app/Contents/bin/webstorm'],
      win32: ['%PROGRAMFILES%\\JetBrains\\WebStorm*\\bin\\webstorm64.exe'],
      linux: ['/usr/bin/webstorm', '/opt/jetbrains/webstorm/bin/webstorm.sh']
    }
  },
  {
    id: 'xcode',
    name: 'Xcode',
    icon: '',
    commands: {
      darwin: ['xed', 'open -a Xcode']
    },
    detectPaths: {
      darwin: ['/Applications/Xcode.app']
    },
    platformRestricted: ['darwin'],
    requiresShell: true
  },
  {
    id: 'zed',
    name: 'Zed',
    icon: '',
    commands: {
      darwin: ['zed'],
      win32: ['zed'],
      linux: ['zed']
    },
    detectPaths: {
      darwin: ['/Applications/Zed.app/Contents/MacOS/zed'],
      linux: ['/usr/bin/zed', '/usr/local/bin/zed']
    }
  },
  // Special editors at the end
  {
    id: 'system',
    name: 'System Default',
    icon: '',
    commands: {
      darwin: ['open'],
      win32: ['explorer'],
      linux: ['xdg-open']
    }
  },
  {
    id: 'custom',
    name: 'Custom Command',
    icon: '',
    commands: {}
  }
];

// All server-side functionality has been moved to /api/projects/open-in-editor/route.ts
// This file now only contains types and editor configurations