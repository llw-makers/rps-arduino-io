import { RPSOutput, RPSCountdownState, RPSAction } from 'rps-stuff';
import SerialPort from 'serialport';
import util from 'util';

enum ArduinoCommand {
  TurnWrist = 4,
  ThumbRelax = 5,
  ThumbCurl = 6,
  PointerRelax = 7,
  PointerCurl = 8,
  MiddleRelax = 9,
  MiddleCurl = 10,
  RingRelax = 11,
  RingCurl = 12,
  PinkyRelax = 13,
  PinkyCurl = 14
}

function delay(ms: number) {
  return new Promise((res, _) => {
    setTimeout(res, ms);
  });
}

export interface ArduinoIdleAnimation {
  do(output: ArduinoOutput): void;
  cleanup(output: ArduinoOutput): void;
}

class TurnWristAnimation implements ArduinoIdleAnimation {
  do(output: ArduinoOutput) {
    output.send(ArduinoCommand.TurnWrist);
  }

  cleanup(_: ArduinoOutput) {}
}

class CycleGesturesAnimation implements ArduinoIdleAnimation {
  timer: NodeJS.Timer = null;
  interval = 1000;

  do(output: ArduinoOutput) {
    let action = RPSAction.Rock;
    output.send(action);
    this.timer = setInterval(() => {
      action++;
      output.send(action);
      if (action >= RPSAction.Scissors) {
        this.cleanup(output);
      }
    }, this.interval);
  }

  cleanup(_: ArduinoOutput) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

class FingerWaveAnimation implements ArduinoIdleAnimation {
  timer: NodeJS.Timer = null;
  interval = 1000;

  do(output: ArduinoOutput) {
    output.send(RPSAction.Rock);
    let finger = 4;
    this.timer = setInterval(() => {
      output.send((finger <= 0 ? 4 : finger - 1) * 2 + 6);
      finger++;
      finger = finger % 5;
      output.send(finger * 2 + 5);
    }, this.interval);
  }

  cleanup(output: ArduinoOutput) {
    output.send(RPSAction.Paper);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class ArduinoOutput implements RPSOutput {
  serial: SerialPort;
  idleTimer: NodeJS.Timer = null;
  idleCurrent: number = null;
  idleInterval = 10000;

  idleAnimations: ArduinoIdleAnimation[] = [new FingerWaveAnimation(), new TurnWristAnimation(), new CycleGesturesAnimation()];

  constructor(
    public port: string,
    public baudRate: number
  ) {}

  send(command: number) {
    console.log(`Sending ${command}`);
    let commandArray = new Int8Array(1);
    commandArray[0] = command;
    this.serial.write(Buffer.from(commandArray.buffer));
  }

  async init() {
    this.serial = new SerialPort(this.port, {baudRate: this.baudRate});
    await delay(2000);
    this.send(RPSAction.Rock);
  }

  stopIdleAnimations() {
    if (this.idleCurrent !== null) {
      this.idleAnimations[this.idleCurrent].cleanup(this);
      this.idleCurrent = null;
    }
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  async cleanup() {
    this.stopIdleAnimations();
    await this.send(RPSAction.Paper);
    await util.promisify(this.serial.close)();
    this.serial = null;
  }

  idle() {
    this.send(RPSAction.Paper);
    if (!this.idleTimer) {
      this.idleTimer = setInterval(() => {
        if (this.idleCurrent !== null) {
          this.idleAnimations[this.idleCurrent].cleanup(this);
        } else {
          this.idleCurrent = -1;
        }
        this.idleCurrent++;
        this.idleCurrent = this.idleCurrent % this.idleAnimations.length;
        this.idleAnimations[this.idleCurrent].do(this);
      }, this.idleInterval);
    }
  }

  countdown(state: RPSCountdownState) {
    this.send(ArduinoCommand.TurnWrist);
  }

  shoot(action: RPSAction) {
    this.send(action);
  }

  gameStart() {
    this.stopIdleAnimations();
    this.send(RPSAction.Rock);
  }
  tryAgain() {}

  robotWin(robot: RPSAction, human: RPSAction) {
    this.send(RPSAction.Rock);
  }
  humanWin(robot: RPSAction, human: RPSAction) {
    this.send(RPSAction.Rock);
  }
  tie(action: RPSAction) {
    this.send(RPSAction.Rock);
  }
  score(robot: number, human: number) {}

  gameStop() {
    this.send(RPSAction.Paper);
  }
}
