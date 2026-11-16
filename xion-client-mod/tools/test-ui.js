#!/usr/bin/env node
// Tests badge/name logic and mod-card/search behavior without booting Minecraft.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process')
const root = path.resolve(__dirname, '..'), dir = path.join(root, '.work', 'ui-tests')
const bin = name => process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', name) : name
const files = {}
for (const file of ['net/xion/client/ui/ModsLayout.java', 'net/xion/client/ui/SearchInput.java', 'net/xion/client/feature/Badge.java']) files[file] = fs.readFileSync(path.join(root, 'src/main/java', file), 'utf8')
files['net/xion/client/ui/ModsUiTest.java'] = fs.readFileSync(path.join(root, 'tests/ui/ModsUiTest.java'), 'utf8')
files['net/xion/client/feature/BadgeTest.java'] = fs.readFileSync(path.join(root, 'tests/ui/BadgeTest.java'), 'utf8')
Object.assign(files, {
  'net/minecraft/network/chat/Style.java': `package net.minecraft.network.chat; public class Style {
    public static final Style EMPTY=new Style(); public int color=0xFFFFFF; public boolean bold;
    public Style withColor(int c){Style s=new Style();s.color=c;s.bold=bold;return s;} public Style withBold(Boolean b){Style s=new Style();s.color=color;s.bold=b;return s;}
    public Style withItalic(Boolean b){return this;} public Style withObfuscated(Boolean b){return this;}
  }`,
  'net/minecraft/network/chat/Component.java': `package net.minecraft.network.chat; public interface Component { String getString(); Style getStyle(); java.util.List<Component> getSiblings(); }`,
  'net/minecraft/network/chat/MutableComponent.java': `package net.minecraft.network.chat; public class MutableComponent implements Component {
    final String text; Style style=Style.EMPTY; final java.util.List<Component> siblings=new java.util.ArrayList<>(); public MutableComponent(String t){text=t;}
    public String getString(){StringBuilder s=new StringBuilder(text);for(Component c:siblings)s.append(c.getString());return s.toString();}
    public Style getStyle(){return style;} public java.util.List<Component> getSiblings(){return siblings;}
    public MutableComponent setStyle(Style s){style=s;return this;} public MutableComponent append(Component c){siblings.add(c);return this;}
  }`,
  'net/xion/client/compat/Compat.java': 'package net.xion.client.compat; public class Compat { public static net.minecraft.network.chat.MutableComponent lit(String s){return new net.minecraft.network.chat.MutableComponent(s);} }',
  'net/xion/client/XionConfig.java': 'package net.xion.client; public class XionConfig { public static final Data data=new Data(); public static class Data { public boolean badge=true; } }',
  'net/xion/client/feature/Premium.java': 'package net.xion.client.feature; public class Premium { public static boolean enabled; public static boolean active(){return enabled;} }',
  'net/xion/client/feature/Presence.java': 'package net.xion.client.feature; public class Presence { public static final java.util.Map<java.util.UUID,Boolean> online=new java.util.HashMap<>(); public static boolean has(java.util.UUID id){return online.containsKey(id);} public static boolean pro(java.util.UUID id){return Boolean.TRUE.equals(online.get(id));} }',
  'net/minecraft/client/Minecraft.java': 'package net.minecraft.client; public class Minecraft { static final Minecraft INSTANCE=new Minecraft(); public TestPlayer player; public static Minecraft getInstance(){return INSTANCE;} public record TestPlayer(java.util.UUID id){public java.util.UUID getUUID(){return id;}} }'
})
const sources = Object.entries(files).map(([name, source]) => {
  const target = path.join(dir, name)
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source)
  return target
})
const classes = path.join(dir, 'classes')
const compile = spawnSync(bin('javac'), ['--release', '17', '-d', classes, ...sources], { encoding: 'utf8' })
if (compile.status !== 0) throw new Error(compile.error || compile.stderr)
for (const name of ['net.xion.client.ui.ModsUiTest', 'net.xion.client.feature.BadgeTest']) {
  const result = spawnSync(bin('java'), ['-cp', classes, name], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.error)
  console.log(result.stdout.trim())
}
