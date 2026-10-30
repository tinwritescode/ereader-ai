//
//  Generated file. Do not edit.
//

import FlutterMacOS
import Foundation

import audio_session
import file_picker_darwin
import flutter_onnxruntime
import just_audio
import shared_preferences_foundation

func RegisterGeneratedPlugins(registry: FlutterPluginRegistry) {
  AudioSessionPlugin.register(with: registry.registrar(forPlugin: "AudioSessionPlugin"))
  FilePickerPlugin.register(with: registry.registrar(forPlugin: "FilePickerPlugin"))
  FlutterOnnxruntimePlugin.register(with: registry.registrar(forPlugin: "FlutterOnnxruntimePlugin"))
  JustAudioPlugin.register(with: registry.registrar(forPlugin: "JustAudioPlugin"))
  SharedPreferencesPlugin.register(with: registry.registrar(forPlugin: "SharedPreferencesPlugin"))
}
