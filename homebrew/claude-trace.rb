class ClaudeTrace < Formula
  desc "Real-time TUI visualization of Claude Code tool execution"
  homepage "https://github.com/ydking0911/claude-trace"
  url "https://registry.npmjs.org/claude-trace/-/claude-trace-1.0.0.tgz"
  sha256 "199c3ce16421abb017ae06ef112c05b2921af4b29f432ff1ab9d1daf03d46880"
  license "MIT"

  depends_on "node"
  depends_on "tmux"

  def install
    libexec.install Dir["*"]
    cd libexec do
      system "npm", "install", "--production", "--ignore-scripts"
    end
    chmod "+x", libexec/"bin/claude-trace.sh"
    bin.install_symlink libexec/"bin/claude-trace.sh" => "claude-trace"
  end

  test do
    assert_match "tmux", shell_output("#{bin}/claude-trace --help 2>&1", 1)
  end
end
