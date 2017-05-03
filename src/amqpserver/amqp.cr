require "./amqp/*"

module AMQPServer
  module AMQP
    PROTOCOL_START = UInt8.slice(65, 77, 81, 80, 0, 0, 9, 1)
    class InvalidFrameEnd < Exception
    end

    alias Field =
      Nil |
      Bool |
      UInt8 |
      UInt16 |
      UInt32 |
      UInt64 |
      Int32 |
      Int64 |
      Float32 |
      Float64 |
      String |
      Array(Field) |
      Array(UInt8) |
      Time |
      Hash(String, Field)

    enum Type : UInt8
      Method = 1
      Header = 2
      Body = 3
      Heartbeat = 8
    end
  end
end
