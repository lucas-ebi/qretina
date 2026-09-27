require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "QRetinaNative"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/lucas-ebi/qretina"
  s.license      = package["license"]
  s.authors      = "QRetina"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/lucas-ebi/qretina.git", :tag => "#{s.version}" }

  s.source_files = [
    "ios/**/*.{h,m,mm}",
    "cpp/**/*.{hpp,cpp}",
    "core/qretina.{hpp,cpp}",
  ]

  load 'nitrogen/generated/ios/QRetinaNative+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
